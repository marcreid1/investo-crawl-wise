/**
 * Investment Scraper - Main Entrypoint
 * Orchestrates discovery, extraction, processing, and storage
 */

import type { CacheStats, Investment, CrawlStrategy } from "./types.ts";
import { discoverInvestmentPages, harvestDetailLinksFromHTML, isDetailPage } from "./discovery.ts";
import { extractInvestmentData } from "./extraction.ts";
import { validateInvestment, applyFallbackExtraction } from "./fallbacks.ts";
import { deduplicateInvestments } from "./processing.ts";
import { saveScrapingHistory } from "./storage.ts";
import { cleanInvestment } from "./utils.ts";
import { getCachedResponse, saveCachedResponse, getOrFetchSnapshot } from "./cache.ts";
import { singleExtractionSchema, listingExtractionSchema, normalizeExtractedData } from "./schemas.ts";
import { preflightCheck, DomainHealthTracker } from "./preflight.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Global domain health tracker
const domainHealthTracker = new DomainHealthTracker();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, crawlDepth, depth, renderJs, maxPages, requestId } = await req.json();
    const rid = requestId || crypto.randomUUID();
    console.log(`[${rid}] Request received for URL: ${url}`);
    console.log(`[${rid}] Firecrawl cache enabled (48-hour expiry)`);
    
    const crawlDepthValue = depth ?? crawlDepth ?? 2;
    const maxPagesValue = maxPages && typeof maxPages === "number" ? maxPages : 100;
    
    const cacheStats: CacheStats = { hits: 0, misses: 0 };
    const crawlStrategy: CrawlStrategy = {
      userDepth: crawlDepthValue,
      finalDepth: crawlDepthValue,
      pagesRequested: maxPagesValue,
      pagesCrawled: 0,
      batchedRequests: 0,
      individualRequests: 0,
    };
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ success: false, error: "Valid URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PHASE 0: Preflight Validation
    console.log(`[${rid}] Step 0: Preflight validation...`);
    const preflightResult = await preflightCheck(url, rid);
    const domainHealth = domainHealthTracker.getHealth(url);
    
    console.log(`[${rid}] 📊 Preflight score: ${preflightResult.confidence}/100`);
    if (domainHealth) {
      console.log(`[${rid}] 📊 Domain health: ${domainHealth.successCount} successes, ${domainHealth.failureCount} failures (${domainHealth.consecutiveFailures} consecutive)`);
    }

    // Check domain health cache
    const shouldSkipBatch = domainHealthTracker.shouldSkipBatch(url);
    const forceFallbackMode = !preflightResult.shouldUseBatch || shouldSkipBatch;
    
    if (forceFallbackMode) {
      console.log(`[${rid}] ⚠️ Using fallback mode - Reason: ${!preflightResult.shouldUseBatch ? 'Low preflight confidence' : 'Domain health issues'}`);
    }

    // PHASE 1: Discovery (with adaptive depth)
    const discoveryResult = await discoverInvestmentPages(
      url, apiKey, crawlDepthValue, maxPagesValue, rid, supabaseUrl, supabaseKey, cacheStats
    );
    
    if (!discoveryResult.success) {
      return new Response(JSON.stringify({ success: false, error: discoveryResult.error }), {
        status: 408,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { discoveredUrls, listingPages, detailPages, isPartial, adaptiveDepth, adaptiveReason } = discoveryResult;
    
    // Update crawl strategy with adaptive results
    crawlStrategy.finalDepth = adaptiveDepth;
    crawlStrategy.adaptiveReason = adaptiveReason;
    crawlStrategy.pagesCrawled = discoveredUrls.length;
    
    console.log(`[${rid}] 📊 Crawl strategy: ${JSON.stringify(crawlStrategy)}`);

    // PHASE 2: Extraction (with /v1/scrape/batch)
    console.log(`[${rid}] Step 2: Extracting data with Firecrawl batch endpoint...`);
    const allInvestments: Investment[] = [];
    const validationResults: any[] = [];
    let successfulPages = 0;
    let failedPages = 0;

    const shouldUseListingSchema = listingPages.length > 0 && detailPages.length === 0;
    const pagesToProcess = shouldUseListingSchema ? listingPages : [...listingPages, ...detailPages];
    
    console.log(`[${rid}] Processing ${pagesToProcess.length} pages (${listingPages.length} listing, ${detailPages.length} detail)`);

    // BATCHING: Use Firecrawl's /v1/scrape/batch endpoint
    const BATCH_SIZE = 10; // Firecrawl can handle up to 10 URLs per batch request
    const batches: string[][] = [];
    for (let i = 0; i < pagesToProcess.length; i += BATCH_SIZE) {
      batches.push(pagesToProcess.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`[${rid}] Using /v1/scrape/batch: ${batches.length} batch requests for ${pagesToProcess.length} pages`);
    crawlStrategy.batchedRequests = batches.length;
    
    // Process batches in parallel with Promise.allSettled
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      console.log(`[${rid}] Processing batch ${batchIdx + 1}/${batches.length} (${batch.length} URLs)...`);
      
      try {
        // Check cache for each URL in batch
        const cachedResults: Map<string, any> = new Map();
        const uncachedUrls: string[] = [];
        
        for (const pageUrl of batch) {
          const isListingPage = listingPages.includes(pageUrl);
          const scrapeCacheType = isListingPage ? 'scrape-listing' : 'scrape-detail';
          
          const cached = await getCachedResponse(supabaseUrl, supabaseKey, pageUrl, scrapeCacheType);
          if (cached) {
            cacheStats.hits++;
            cachedResults.set(pageUrl, { pageUrl, isListingPage, scrapeData: cached });
          } else {
            cacheStats.misses++;
            uncachedUrls.push(pageUrl);
          }
        }
        
        console.log(`[${rid}] Batch cache: ${cachedResults.size} hits, ${uncachedUrls.length} misses`);
        
        // Fetch uncached URLs using /v1/batch/scrape (unless forced fallback mode)
        if (uncachedUrls.length > 0) {
          crawlStrategy.individualRequests += uncachedUrls.length;
          
          // Skip batch mode if preflight or domain health suggests fallback
          if (forceFallbackMode) {
            console.log(`[${rid}] ⚠️ Skipping batch mode, using individual scrapes for ${uncachedUrls.length} URLs...`);
            
            for (const pageUrl of uncachedUrls) {
              try {
                const individualResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
                  method: "POST",
                  headers: { 
                    Authorization: `Bearer ${apiKey}`, 
                    "Content-Type": "application/json" 
                  },
                  body: JSON.stringify({
                    url: pageUrl,
                    formats: ["markdown", "html"],
                    onlyMainContent: true,
                    waitFor: 2000,
                    timeout: 25000,
                  }),
                });
                
                if (individualResponse.ok) {
                  const scrapeData = await individualResponse.json();
                  const isListingPage = listingPages.includes(pageUrl);
                  const scrapeCacheType = 'scrape-markdown';
                  
                  await saveCachedResponse(supabaseUrl, supabaseKey, pageUrl, scrapeCacheType, scrapeData);
                  cachedResults.set(pageUrl, { pageUrl, isListingPage, scrapeData });
                  console.log(`[${rid}] ✅ Individual scrape success: ${pageUrl}`);
                } else {
                  console.error(`[${rid}] ❌ Individual scrape failed for ${pageUrl}: ${individualResponse.status}`);
                  failedPages++;
                }
              } catch (error) {
                console.error(`[${rid}] ❌ Individual scrape error for ${pageUrl}:`, error);
                failedPages++;
              }
            }
          } else {
            // Use batch mode
            const batchResponse = await fetch("https://api.firecrawl.dev/v1/batch/scrape", {
            method: "POST",
            headers: { 
              Authorization: `Bearer ${apiKey}`, 
              "Content-Type": "application/json" 
            },
            body: JSON.stringify({
              urls: uncachedUrls,
              extract: { 
                schema: shouldUseListingSchema ? listingExtractionSchema : singleExtractionSchema 
              },
              formats: ["extract", "markdown", "html"],
              onlyMainContent: true,
              waitFor: 2000,
              timeout: 25000,
            }),
          });

          if (batchResponse.ok) {
            const batchData = await batchResponse.json();
            const results = batchData.data || [];
            
            // Record success for domain health tracking
            domainHealthTracker.recordSuccess(url);
            
            for (let i = 0; i < uncachedUrls.length; i++) {
              const pageUrl = uncachedUrls[i];
              const scrapeData = results[i];
              const isListingPage = listingPages.includes(pageUrl);
              const scrapeCacheType = isListingPage ? 'scrape-listing' : 'scrape-detail';
              
              if (scrapeData) {
                // Cache individual result
                await saveCachedResponse(supabaseUrl, supabaseKey, pageUrl, scrapeCacheType, scrapeData);
                cachedResults.set(pageUrl, { pageUrl, isListingPage, scrapeData });
              }
            }
          } else {
            const statusCode = batchResponse.status;
            console.error(`[${rid}] Batch request failed: ${statusCode}`);
            
            // Record failure for domain health tracking
            const failureType = statusCode === 503 ? '503' : statusCode === 429 ? '429' : 'other';
            domainHealthTracker.recordFailure(url, failureType);
            
            // Fallback to individual scrapes if batch fails or if forced fallback mode
            if (forceFallbackMode || !batchResponse.ok) {
              console.log(`[${rid}] 🔄 Falling back to individual scrapes for ${uncachedUrls.length} URLs...`);
              
              for (const pageUrl of uncachedUrls) {
                try {
                  const individualResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
                    method: "POST",
                    headers: { 
                      Authorization: `Bearer ${apiKey}`, 
                      "Content-Type": "application/json" 
                    },
                    body: JSON.stringify({
                      url: pageUrl,
                      formats: ["markdown", "html"],
                      onlyMainContent: true,
                      waitFor: 2000,
                      timeout: 25000,
                    }),
                  });
                  
                  if (individualResponse.ok) {
                    const scrapeData = await individualResponse.json();
                    const isListingPage = listingPages.includes(pageUrl);
                    const scrapeCacheType = 'scrape-markdown';
                    
                    await saveCachedResponse(supabaseUrl, supabaseKey, pageUrl, scrapeCacheType, scrapeData);
                    cachedResults.set(pageUrl, { pageUrl, isListingPage, scrapeData });
                    console.log(`[${rid}] ✅ Individual scrape success: ${pageUrl}`);
                  } else {
                    console.error(`[${rid}] ❌ Individual scrape failed for ${pageUrl}: ${individualResponse.status}`);
                    failedPages++;
                  }
                } catch (error) {
                  console.error(`[${rid}] ❌ Individual scrape error for ${pageUrl}:`, error);
                  failedPages++;
                }
              }
            } else {
              failedPages += uncachedUrls.length;
            }
          }
          }
        }
        
        // Process all results (cached + freshly fetched)
        for (const { pageUrl, isListingPage, scrapeData } of cachedResults.values()) {
          try {
            const extracted = scrapeData?.data?.extract || scrapeData?.extract;
            const markdown = scrapeData?.data?.markdown || scrapeData?.markdown;
            const html = scrapeData?.data?.html || scrapeData?.html;
            
            const pageInvestments: Investment[] = [];
            
            if (!extracted || !scrapeData?.success) {
            console.log(`[${rid}] Using fallback extraction for ${pageUrl}`);
            
            let fallbackMarkdown = markdown;
            let fallbackHtml = html;
            
            if (!fallbackMarkdown && !fallbackHtml) {
              let markdownData = await getCachedResponse(supabaseUrl, supabaseKey, pageUrl, 'scrape-markdown');
              
              if (markdownData) {
                cacheStats.hits++;
                fallbackMarkdown = markdownData?.data?.markdown || markdownData?.markdown;
                fallbackHtml = markdownData?.data?.html || markdownData?.html;
              } else {
                cacheStats.misses++;
                
                const markdownResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    url: pageUrl,
                    formats: ["markdown", "html"],
                    onlyMainContent: true,
                    waitFor: 2000,
                    timeout: 25000,
                  }),
                });
                
                if (markdownResponse.ok) {
                  markdownData = await markdownResponse.json();
                  fallbackMarkdown = markdownData?.data?.markdown || markdownData?.markdown;
                  fallbackHtml = markdownData?.data?.html || markdownData?.html;
                  await saveCachedResponse(supabaseUrl, supabaseKey, pageUrl, 'scrape-markdown', markdownData);
                }
              }
            }
            
            if (fallbackMarkdown || fallbackHtml) {
              const pageData = { markdown: fallbackMarkdown || "", html: fallbackHtml || "", metadata: { url: pageUrl } };
              let fallbackInvestments = extractInvestmentData(pageData);
              
              if (!isDetailPage(pageUrl) && fallbackInvestments.length < 3 && fallbackHtml) {
                const harvested = harvestDetailLinksFromHTML(fallbackHtml, pageUrl, maxPagesValue);
                fallbackInvestments = fallbackInvestments.concat(harvested.internal.map(link => ({
                  name: link.split('/').pop() || link,
                  sourceUrl: link,
                  portfolioUrl: link
                })));
              }
              
              fallbackInvestments.forEach(inv => {
                const enhanced = applyFallbackExtraction(inv, fallbackMarkdown);
                const validation = validateInvestment(enhanced);
                pageInvestments.push(enhanced);
                return { investment: enhanced, validation };
              });
            }
            } else {
              // AI extraction succeeded - use new nested schema format
              const normalized = normalizeExtractedData(extracted, pageUrl);
              const extractedInvestments = Array.isArray(normalized) ? normalized : [normalized];
              
              extractedInvestments.forEach((investment: any) => {
                if (investment && investment.name) {
                  const enhanced = applyFallbackExtraction(investment, markdown);
                  const validation = validateInvestment(enhanced);
                  pageInvestments.push(enhanced);
                  validationResults.push({ ...validation, name: enhanced.name });
                }
              });
            }
            
            successfulPages++;
            pageInvestments.forEach(inv => allInvestments.push(inv));
            
          } catch (pageError) {
            console.error(`[${rid}] Error processing ${pageUrl}:`, pageError);
            failedPages++;
          }
        }
        
      } catch (batchError) {
        console.error(`[${rid}] Batch ${batchIdx + 1} error:`, batchError);
        failedPages += batch.length;
      }
      
      console.log(`[${rid}] Batch ${batchIdx + 1} complete: ${successfulPages} successful, ${failedPages} failed so far`);
    }

    // PHASE 3: Processing
    console.log(`Deduplicating ${allInvestments.length} total investments...`);
    const uniqueInvestments = deduplicateInvestments(allInvestments);
    const cleanedInvestments = uniqueInvestments.map(cleanInvestment);
    
    // PHASE 4: Response
    const avgConfidence = validationResults.length > 0
      ? Math.round(validationResults.reduce((sum, v) => sum + v.confidence, 0) / validationResults.length)
      : 0;

    // Calculate credit savings
    const totalRequests = cacheStats.hits + cacheStats.misses;
    const firecrawlCreditsSaved = Math.round(cacheStats.hits * 0.8); // Estimate: 0.8 credits per cached request
    
    const responseData = {
      success: true,
      partial: isPartial,
      crawlStrategy, // Include adaptive crawl strategy metrics
      crawlStats: {
        completed: discoveredUrls.length,
        total: discoveredUrls.length,
        creditsUsed: Math.max(1, Math.ceil(discoveredUrls.length / 10)),
        successfulPages,
        failedPages,
        cacheHits: cacheStats.hits,
        cacheMisses: cacheStats.misses,
        firecrawlCreditsSaved,
      },
      preflight: {
        confidence: preflightResult.confidence,
        accessible: preflightResult.accessible,
        htmlBased: preflightResult.htmlBased,
        hasInvestmentSignals: preflightResult.hasInvestmentSignals,
        contentSize: preflightResult.contentLength ? `${(preflightResult.contentLength / 1024).toFixed(1)}KB` : 'unknown',
        reasons: preflightResult.reasons,
        usedBatchMode: !forceFallbackMode,
      },
      domainHealth: domainHealth ? {
        domain: domainHealth.domain,
        successRate: domainHealth.successCount / (domainHealth.successCount + domainHealth.failureCount),
        consecutiveFailures: domainHealth.consecutiveFailures,
        lastFailureType: domainHealth.lastFailureType,
      } : undefined,
      investments: cleanedInvestments,
      extractionQuality: {
        totalPages: discoveredUrls.length,
        successfulExtractions: successfulPages,
        averageConfidence: avgConfidence,
      },
      metadata: {
        url,
        crawlDepth: crawlDepthValue,
        maxPages: maxPagesValue,
        extractionMode: "structured",
        timestamp: new Date().toISOString(),
        requestId: rid,
      },
    };

    console.log(`[${rid}] Returning response with ${cleanedInvestments.length} investments`);
    console.log(`[${rid}] 💰 Credit savings: ${firecrawlCreditsSaved} credits saved via caching`);
    console.log(`[${rid}] Cache stats: ${cacheStats.hits} hits, ${cacheStats.misses} misses (${totalRequests > 0 ? Math.round((cacheStats.hits / totalRequests) * 100) : 0}% hit rate)`);
    console.log(`[${rid}] Crawl strategy: User depth=${crawlStrategy.userDepth}, Final depth=${crawlStrategy.finalDepth}, Pages=${crawlStrategy.pagesCrawled}/${crawlStrategy.pagesRequested}`);
    if (crawlStrategy.adaptiveReason) {
      console.log(`[${rid}] Adaptive reasoning: ${crawlStrategy.adaptiveReason}`);
    }

    // PHASE 5: Storage (background)
    if (supabaseUrl && supabaseKey) {
      saveScrapingHistory(supabaseUrl, supabaseKey, url, cleanedInvestments, responseData.crawlStats);
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in scrape function:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
