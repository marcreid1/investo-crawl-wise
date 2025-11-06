/**
 * Investment Scraper - Main Entrypoint
 * Orchestrates discovery, extraction, processing, and storage
 */

import type { CacheStats, Investment } from "./types.ts";
import { discoverInvestmentPages, harvestDetailLinksFromHTML, isDetailPage } from "./discovery.ts";
import { extractInvestmentData } from "./extraction.ts";
import { validateInvestment, applyFallbackExtraction } from "./fallbacks.ts";
import { deduplicateInvestments } from "./processing.ts";
import { saveScrapingHistory } from "./storage.ts";
import { cleanInvestment } from "./utils.ts";
import { getCachedResponse, saveCachedResponse } from "./cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Firecrawl extraction schemas
const singleExtractionSchema = {
  type: "object",
  properties: {
    company_name: { type: "string", description: "The portfolio company name for THIS SPECIFIC PAGE ONLY." },
    industry: { type: "string", description: "Industry for THIS SPECIFIC COMPANY ONLY." },
    ceo: { type: "string", description: "CEO or company leader name." },
    investment_role: { type: "string", description: "The private equity firm's role in this investment." },
    ownership: { type: "string", description: "Ownership stake or control level." },
    year_of_initial_investment: { type: "string", description: "Year of first investment." },
    location: { type: "string", description: "Company headquarters location." },
    website: { type: "string", description: "Company website URL." },
    status: { type: "string", description: "Investment status." }
  },
  required: ["company_name"]
};

const listingExtractionSchema = {
  type: "object",
  properties: {
    investments: {
      type: "array",
      description: "Array of ALL portfolio companies visible on this page.",
      items: {
        type: "object",
        properties: {
          company_name: { type: "string", description: "Portfolio company name for THIS SPECIFIC COMPANY ONLY." },
          industry: { type: "string", description: "Industry for THIS SPECIFIC COMPANY ONLY." },
          ceo: { type: "string", description: "CEO or leader for THIS SPECIFIC COMPANY ONLY." },
          investment_role: { type: "string", description: "Investment role for THIS SPECIFIC COMPANY." },
          ownership: { type: "string", description: "Ownership for THIS SPECIFIC COMPANY." },
          year_of_initial_investment: { type: "string", description: "Year of investment for THIS SPECIFIC COMPANY." },
          location: { type: "string", description: "Headquarters location for THIS SPECIFIC COMPANY." },
          website: { type: "string", description: "Website URL for THIS SPECIFIC COMPANY." },
          status: { type: "string", description: "Status for THIS SPECIFIC COMPANY." }
        },
        required: ["company_name"]
      }
    }
  },
  required: ["investments"]
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, crawlDepth, depth, renderJs, maxPages, requestId } = await req.json();
    const rid = requestId || crypto.randomUUID();
    console.log(`[${rid}] Request received for URL: ${url}`);
    console.log(`[${rid}] Firecrawl cache enabled (48-hour expiry)`);
    
    const cacheStats: CacheStats = { hits: 0, misses: 0 };
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ success: false, error: "Valid URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const crawlDepthValue = depth ?? crawlDepth ?? 2;
    const maxPagesValue = maxPages && typeof maxPages === "number" ? maxPages : 100;
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PHASE 1: Discovery
    const discoveryResult = await discoverInvestmentPages(
      url, apiKey, crawlDepthValue, maxPagesValue, rid, supabaseUrl, supabaseKey, cacheStats
    );
    
    if (!discoveryResult.success) {
      return new Response(JSON.stringify({ success: false, error: discoveryResult.error }), {
        status: 408,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { discoveredUrls, listingPages, detailPages, isPartial } = discoveryResult;

    // PHASE 2: Extraction
    console.log(`[${rid}] Step 2: Extracting structured data from ${discoveredUrls.length} discovered pages...`);
    const allInvestments: Investment[] = [];
    const validationResults: any[] = [];
    let successfulPages = 0;
    let failedPages = 0;

    const shouldUseListingSchema = listingPages.length > 0 && detailPages.length === 0;
    const pagesToProcess = shouldUseListingSchema ? listingPages : [...listingPages, ...detailPages];

    for (const pageUrl of pagesToProcess) {
      try {
        const isListingPage = listingPages.includes(pageUrl);
        const schemaToUse = isListingPage ? listingExtractionSchema : singleExtractionSchema;
        const scrapeCacheType = isListingPage ? 'scrape-listing' : 'scrape-detail';
        
        let scrapeData = await getCachedResponse(supabaseUrl, supabaseKey, pageUrl, scrapeCacheType);
        let scrapeResponseOk = true;
        
        if (scrapeData) {
          cacheStats.hits++;
        } else {
          cacheStats.misses++;
          
          const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              url: pageUrl,
              formats: ["extract", "markdown", "html"],
              extract: { schema: schemaToUse },
              onlyMainContent: true,
              waitFor: 2000,
              timeout: 25000,
            }),
          });

          scrapeResponseOk = scrapeResponse.ok;
          scrapeData = !scrapeResponse.ok ? null : await scrapeResponse.json();
          
          if (scrapeData && scrapeResponse.ok) {
            await saveCachedResponse(supabaseUrl, supabaseKey, pageUrl, scrapeCacheType, scrapeData);
          }
        }
        
        const extracted = scrapeData?.data?.extract || scrapeData?.extract;
        const markdown = scrapeData?.data?.markdown || scrapeData?.markdown;
        const html = scrapeData?.data?.html || scrapeData?.html;
        
        const needsFallback = !scrapeResponseOk || !scrapeData?.success || !extracted;
        
        if (needsFallback) {
          console.log(`Using markdown/HTML fallback extraction for ${pageUrl}`);
          
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
              validationResults.push({ ...validation, name: enhanced.name });
              allInvestments.push(enhanced);
            });
            
            successfulPages++;
          } else {
            failedPages++;
          }
        } else {
          // AI extraction succeeded
          const extractedInvestments = isListingPage ? (extracted.investments || []) : [extracted];
          
          extractedInvestments.forEach((item: any) => {
            const investment: Investment = {
              name: item.company_name || item.name || "",
              industry: item.industry,
              ceo: item.ceo,
              investmentRole: item.investment_role,
              ownership: item.ownership,
              year: item.year_of_initial_investment,
              location: item.location,
              website: item.website,
              status: item.status,
              sourceUrl: pageUrl,
              portfolioUrl: pageUrl,
            };
            
            const enhanced = applyFallbackExtraction(investment, markdown);
            const validation = validateInvestment(enhanced);
            validationResults.push({ ...validation, name: enhanced.name });
            allInvestments.push(enhanced);
          });
          
          successfulPages++;
        }
      } catch (pageError) {
        console.error(`Error processing page ${pageUrl}:`, pageError);
        failedPages++;
      }
    }

    // PHASE 3: Processing
    console.log(`Deduplicating ${allInvestments.length} total investments...`);
    const uniqueInvestments = deduplicateInvestments(allInvestments);
    const cleanedInvestments = uniqueInvestments.map(cleanInvestment);
    
    // PHASE 4: Response
    const avgConfidence = validationResults.length > 0
      ? Math.round(validationResults.reduce((sum, v) => sum + v.confidence, 0) / validationResults.length)
      : 0;

    const responseData = {
      success: true,
      partial: isPartial,
      crawlStats: {
        completed: discoveredUrls.length,
        total: discoveredUrls.length,
        creditsUsed: discoveredUrls.length,
        successfulPages,
        failedPages,
        cacheHits: cacheStats.hits,
        cacheMisses: cacheStats.misses,
      },
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
    console.log(`[${rid}] Cache stats: ${cacheStats.hits} hits, ${cacheStats.misses} misses`);

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
