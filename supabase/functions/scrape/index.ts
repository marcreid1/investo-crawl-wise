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

    // PHASE 2: Extraction (Markdown-First Strategy)
    console.log(`[${rid}] Step 2: Extracting data with markdown-first strategy...`);
    const allInvestments: Investment[] = [];
    const validationResults: any[] = [];
    let successfulPages = 0;
    let failedPages = 0;

    // Split processing: batch+schema for listing pages, markdown for detail pages
    const listingPagesToProcess = listingPages;
    const detailPagesToProcess = detailPages;
    
    // Credit estimation
    const estimatedListingCredits = listingPagesToProcess.length * 5; // ~5 credits per listing with schema
    const estimatedDetailCredits = detailPagesToProcess.length * 1; // ~1 credit per detail with markdown
    const totalEstimatedCredits = estimatedListingCredits + estimatedDetailCredits;
    console.log(`[${rid}] 💰 Estimated credits: ${totalEstimatedCredits} (${estimatedListingCredits} listing + ${estimatedDetailCredits} detail)`);
    
    console.log(`[${rid}] Processing ${listingPagesToProcess.length} listing pages with batch+schema and ${detailPagesToProcess.length} detail pages with markdown`);

    // PART 1: Process listing pages with batch+schema (if any)
    if (listingPagesToProcess.length > 0) {
      console.log(`[${rid}] Processing ${listingPagesToProcess.length} listing pages with batch+schema...`);
      const BATCH_SIZE = 10;
      const listingBatches: string[][] = [];
      for (let i = 0; i < listingPagesToProcess.length; i += BATCH_SIZE) {
        listingBatches.push(listingPagesToProcess.slice(i, i + BATCH_SIZE));
      }
      crawlStrategy.batchedRequests = listingBatches.length;
    
    // Process listing page batches
    for (let batchIdx = 0; batchIdx < listingBatches.length; batchIdx++) {
      const batch = listingBatches[batchIdx];
      console.log(`[${rid}] Processing batch ${batchIdx + 1}/${listingBatches.length} (${batch.length} URLs)...`);
      
      try {
        // Check cache for each URL in batch
        const cachedResults: Map<string, any> = new Map();
        const uncachedUrls: string[] = [];
        
        for (const pageUrl of batch) {
          const scrapeCacheType = 'scrape-listing';
          
          const cached = await getCachedResponse(supabaseUrl, supabaseKey, pageUrl, scrapeCacheType);
          if (cached) {
            cacheStats.hits++;
            cachedResults.set(pageUrl, { pageUrl, isListingPage: true, scrapeData: cached });
          } else {
            cacheStats.misses++;
            uncachedUrls.push(pageUrl);
          }
        }
        
        console.log(`[${rid}] Batch cache: ${cachedResults.size} hits, ${uncachedUrls.length} misses`);
        
        // Fetch uncached listing URLs using /v1/batch/scrape
        if (uncachedUrls.length > 0 && !forceFallbackMode) {
          console.log(`[${rid}] Fetching ${uncachedUrls.length} listing pages with batch+schema...`);
          const batchResponse = await fetch("https://api.firecrawl.dev/v1/batch/scrape", {
            method: "POST",
            headers: { 
              Authorization: `Bearer ${apiKey}`, 
              "Content-Type": "application/json" 
            },
            body: JSON.stringify({
              urls: uncachedUrls,
              extract: { 
                schema: listingExtractionSchema 
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
            
            // Robust batch failure detection
            const extractedCount = results.filter((r: any) => r?.data?.extract || r?.extract).length;
            const needsFallback = results.length === 0 || 
                                 extractedCount === 0 || 
                                 results.length !== uncachedUrls.length;
            
            if (needsFallback) {
              if (results.length === 0) {
                console.log(`[${rid}] ⚠️ Batch returned 0 results, falling back to markdown scrapes for all ${uncachedUrls.length} URLs...`);
              } else if (results.length !== uncachedUrls.length) {
                console.log(`[${rid}] ⚠️ Batch returned ${results.length}/${uncachedUrls.length} results, falling back for missing URLs...`);
              } else if (extractedCount === 0) {
                console.log(`[${rid}] ⚠️ Batch returned empty extractions (0/${results.length}), falling back to markdown scrapes...`);
              }
              
              domainHealthTracker.recordFailure(url, 'other');
              
              // Fall back to markdown scrapes for all uncached URLs
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
                    await saveCachedResponse(supabaseUrl, supabaseKey, pageUrl, 'scrape-markdown', scrapeData);
                    cachedResults.set(pageUrl, { pageUrl, isListingPage: true, scrapeData });
                    console.log(`[${rid}] ✅ Markdown fallback success: ${pageUrl}`);
                  } else {
                    console.error(`[${rid}] ❌ Markdown fallback failed for ${pageUrl}: ${individualResponse.status}`);
                    failedPages++;
                  }
                } catch (error) {
                  console.error(`[${rid}] ❌ Markdown fallback error for ${pageUrl}:`, error);
                  failedPages++;
                }
              }
            } else {
              // Batch extraction succeeded
              console.log(`[${rid}] ✅ Batch extracted ${extractedCount}/${results.length} listings successfully`);
              domainHealthTracker.recordSuccess(url);
              
              for (let i = 0; i < uncachedUrls.length; i++) {
                const pageUrl = uncachedUrls[i];
                const scrapeData = results[i];
                
                if (scrapeData) {
                  await saveCachedResponse(supabaseUrl, supabaseKey, pageUrl, 'scrape-listing', scrapeData);
                  cachedResults.set(pageUrl, { pageUrl, isListingPage: true, scrapeData });
                }
              }
            }
          } else {
            const statusCode = batchResponse.status;
            console.error(`[${rid}] Batch request failed: ${statusCode}`);
            domainHealthTracker.recordFailure(url, statusCode === 503 ? '503' : statusCode === 429 ? '429' : 'other');
            failedPages += uncachedUrls.length;
          }
        } else if (forceFallbackMode && uncachedUrls.length > 0) {
          // Fallback mode: use markdown scrapes for listing pages
          console.log(`[${rid}] Using markdown fallback for ${uncachedUrls.length} listing pages...`);
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
                await saveCachedResponse(supabaseUrl, supabaseKey, pageUrl, 'scrape-markdown', scrapeData);
                cachedResults.set(pageUrl, { pageUrl, isListingPage: true, scrapeData });
              } else {
                failedPages++;
              }
            } catch (error) {
              console.error(`[${rid}] ❌ Markdown fallback error:`, error);
              failedPages++;
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
              
              // Check if this is an image-grid listing page with minimal data
              if (!isDetailPage(pageUrl) && fallbackInvestments.length >= 5) {
                const hasMinimalData = fallbackInvestments.every(inv => !inv.industry && !inv.year && !inv.ceo);
                
                if (hasMinimalData && fallbackHtml) {
                  console.log(`[${rid}] Detected image-grid listing with ${fallbackInvestments.length} companies - attempting detail page discovery...`);
                  
                  // Import the extraction function
                  const { extractDetailLinksFromMarkdown } = await import("./extraction.ts");
                  const detailPageUrls = extractDetailLinksFromMarkdown(fallbackMarkdown || "", fallbackHtml, pageUrl);
                  
                  if (detailPageUrls.length > 0) {
                    console.log(`[${rid}] Found ${detailPageUrls.length} detail page URLs - initiating second-pass crawl...`);
                    
                    // Process detail pages to enrich data (limit to 20 for performance)
                    for (const detailUrl of detailPageUrls.slice(0, 20)) {
                      try {
                        const detailCached = await getCachedResponse(supabaseUrl, supabaseKey, detailUrl, 'scrape-markdown');
                        let detailData;
                        
                        if (detailCached) {
                          detailData = detailCached;
                          cacheStats.hits++;
                        } else {
                          cacheStats.misses++;
                          const detailResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
                            method: "POST",
                            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                            body: JSON.stringify({
                              url: detailUrl,
                              formats: ["markdown", "html"],
                              onlyMainContent: true,
                              waitFor: 2000,
                              timeout: 25000,
                            }),
                          });
                          
                          if (detailResponse.ok) {
                            detailData = await detailResponse.json();
                            await saveCachedResponse(supabaseUrl, supabaseKey, detailUrl, 'scrape-markdown', detailData);
                          }
                        }
                        
                        if (detailData) {
                          const detailMarkdown = detailData?.data?.markdown || detailData?.markdown || "";
                          const detailHtml = detailData?.data?.html || detailData?.html || "";
                          const detailPageData = { markdown: detailMarkdown, html: detailHtml, metadata: { url: detailUrl } };
                          const detailInvestments = extractInvestmentData(detailPageData);
                          
                          if (detailInvestments.length > 0) {
                            // Helper function to normalize names for matching
                            const normalizeForMatching = (name: string): string => {
                              return name
                                .toLowerCase()
                                .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\b\.?/gi, '')
                                .replace(/[^\w\s]/g, '')
                                .trim();
                            };

                            const detailInv = detailInvestments[0];
                            let matchingInv = null;

                            // 1. Try URL matching (most reliable)
                            if (detailUrl) {
                              const detailSlug = detailUrl.split('/').filter(p => p).pop() || '';
                              matchingInv = fallbackInvestments.find(inv => 
                                inv.portfolioUrl && inv.portfolioUrl.includes(detailSlug)
                              );
                              if (matchingInv) {
                                console.log(`[${rid}] ✓ Matched via URL: ${matchingInv.name} -> ${detailUrl}`);
                              }
                            }

                            // 2. Try exact normalized name match
                            if (!matchingInv) {
                              const normalizedDetailName = normalizeForMatching(detailInv.name);
                              matchingInv = fallbackInvestments.find(inv => 
                                normalizeForMatching(inv.name) === normalizedDetailName
                              );
                              if (matchingInv) {
                                console.log(`[${rid}] ✓ Matched via exact name: ${matchingInv.name} <-> ${detailInv.name}`);
                              }
                            }

                            // 3. Try partial match (only if names are substantial)
                            if (!matchingInv && detailInv.name.length > 3) {
                              const normalizedDetailName = normalizeForMatching(detailInv.name);
                              matchingInv = fallbackInvestments.find(inv => {
                                const normalizedInvName = normalizeForMatching(inv.name);
                                return normalizedInvName.length > 3 && (
                                  normalizedInvName.includes(normalizedDetailName) ||
                                  normalizedDetailName.includes(normalizedInvName)
                                );
                              });
                              if (matchingInv) {
                                console.log(`[${rid}] ✓ Matched via partial name: ${matchingInv.name} <-> ${detailInv.name}`);
                              }
                            }

                            if (matchingInv) {
                              Object.assign(matchingInv, {
                                ...detailInv,
                                name: matchingInv.name, // Keep original name from listing
                                portfolioUrl: matchingInv.portfolioUrl || detailInv.portfolioUrl,
                              });
                              // Apply per-detail fallback enrichment using this detail page's markdown only
                              applyFallbackExtraction(matchingInv, detailMarkdown);
                              console.log(`[${rid}] ✓ Enriched ${matchingInv.name} with detail page data (industry: ${detailInv.industry}, year: ${detailInv.year}) and applied detail-level fallback`);
                            } else {
                              console.warn(`[${rid}] ⚠️ No match found for detail page ${detailUrl} (extracted: ${detailInv.name})`);
                            }
                          }
                        }
                      } catch (detailError) {
                        console.error(`[${rid}] Error processing detail page ${detailUrl}:`, detailError);
                      }
                    }
                  }
                }
              }
              
              if (!isDetailPage(pageUrl) && fallbackInvestments.length < 3 && fallbackHtml) {
                const harvested = harvestDetailLinksFromHTML(fallbackHtml, pageUrl, maxPagesValue);
                fallbackInvestments = fallbackInvestments.concat(harvested.internal.map(link => ({
                  name: link.split('/').pop() || link,
                  sourceUrl: link,
                  portfolioUrl: link
                })));
              }
              
              console.log(`[${rid}] Skipping listing-level fallback enrichment to avoid page-global fields for ${fallbackInvestments.length} items`);
              fallbackInvestments.forEach(inv => {
                const validation = validateInvestment(inv);
                pageInvestments.push(inv);
                return { investment: inv, validation };
              });
            }
            } else {
              // AI extraction succeeded - use new nested schema format
              const normalized = normalizeExtractedData(extracted, pageUrl);
              const extractedInvestments = Array.isArray(normalized) ? normalized : [normalized];
              
              console.log(`[${rid}] Skipping listing-level fallback enrichment on AI-extracted items to avoid page-global fields`);
              extractedInvestments.forEach((investment: any) => {
                if (investment && investment.name) {
                  const validation = validateInvestment(investment);
                  pageInvestments.push(investment);
                  validationResults.push({ ...validation, name: investment.name });
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
      
      console.log(`[${rid}] Listing batch ${batchIdx + 1}/${listingBatches.length} complete`);
    }
    }
    
    // PART 2: Process detail pages with markdown-only (cost-efficient)
    if (detailPagesToProcess.length > 0) {
      console.log(`[${rid}] Processing ${detailPagesToProcess.length} detail pages with markdown-only strategy...`);
      crawlStrategy.individualRequests = detailPagesToProcess.length;
      
      // Process detail pages individually with markdown
      for (const pageUrl of detailPagesToProcess) {
        try {
          // Check cache first
          const cached = await getCachedResponse(supabaseUrl, supabaseKey, pageUrl, 'scrape-markdown');
          let scrapeData;
          
          if (cached) {
            cacheStats.hits++;
            scrapeData = cached;
            console.log(`[${rid}] ✓ Cache HIT for detail: ${pageUrl}`);
          } else {
            cacheStats.misses++;
            console.log(`[${rid}] ✗ Cache MISS for detail: ${pageUrl}`);
            
            // Fetch with markdown-only
            const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
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
            
            if (response.ok) {
              scrapeData = await response.json();
              await saveCachedResponse(supabaseUrl, supabaseKey, pageUrl, 'scrape-markdown', scrapeData);
            } else {
              console.error(`[${rid}] ❌ Failed to scrape detail page: ${pageUrl}`);
              failedPages++;
              continue;
            }
          }
          
          // Extract from markdown
          const markdown = scrapeData?.data?.markdown || scrapeData?.markdown;
          const html = scrapeData?.data?.html || scrapeData?.html;
          
          // DEBUG: Log markdown sample for first detail page
          if (markdown && detailPagesToProcess.indexOf(pageUrl) === 0) {
            console.log(`[${rid}] 📄 MARKDOWN SAMPLE (first 500 chars):`);
            console.log(markdown.substring(0, 500));
            console.log(`[${rid}] 📄 END MARKDOWN SAMPLE`);
          }
          
          if (markdown || html) {
            const pageData = { markdown: markdown || "", html: html || "", metadata: { url: pageUrl } };
            const investments = extractInvestmentData(pageData);
            
            investments.forEach(inv => {
              const enhanced = applyFallbackExtraction(inv, markdown);
              const validation = validateInvestment(enhanced);
              allInvestments.push(enhanced);
              validationResults.push({ ...validation, name: enhanced.name });
            });
            
            successfulPages++;
          } else {
            failedPages++;
          }
          
        } catch (error) {
          console.error(`[${rid}] ❌ Error processing detail page ${pageUrl}:`, error);
          failedPages++;
        }
      }
      
      console.log(`[${rid}] Detail pages complete: ${successfulPages} successful, ${failedPages} failed`);
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
