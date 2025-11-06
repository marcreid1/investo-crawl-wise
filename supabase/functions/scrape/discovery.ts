/**
 * URL discovery and categorization for investment pages
 * Handles crawling, link harvesting, and page type detection
 */

import type { CacheStats } from "./types.ts";
import { getCachedResponse, saveCachedResponse } from "./cache.ts";

/**
 * Extracts detail page links from listing page HTML (internal + external)
 */
export function harvestDetailLinksFromHTML(
  html: string,
  baseUrl: string,
  maxPages: number = 50
): { internal: string[], external: string[] } {
  if (!html) return { internal: [], external: [] };
  
  const internalLinks = new Set<string>();
  const externalLinks = new Set<string>();
  const base = new URL(baseUrl);
  
  const anchorPattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let match;
  
  while ((match = anchorPattern.exec(html)) !== null) {
    try {
      const href = match[1];
      const innerText = match[2].trim();
      
      let absoluteUrl: string;
      if (href.startsWith('http://') || href.startsWith('https://')) {
        absoluteUrl = href;
      } else if (href.startsWith('/')) {
        absoluteUrl = `${base.origin}${href}`;
      } else {
        continue;
      }
      
      const url = new URL(absoluteUrl);
      const cleanUrl = absoluteUrl.split('#')[0].split('?')[0];
      
      if (url.origin === base.origin) {
        const path = url.pathname.toLowerCase();
        if (/\/(portfolio|investments|companies?)\/[^\/#?]+\/?$/i.test(path)) {
          if (!path.match(/\/(portfolio|investments|companies?)\/?$/i)) {
            internalLinks.add(cleanUrl);
          }
        }
      } else {
        const words = innerText.split(/\s+/).filter(w => w.length > 0);
        const isTitleCase = words.every(w => /^[A-Z]/.test(w));
        const isPlausibleCompanyName = words.length >= 2 && words.length <= 4 && innerText.length < 60;
        const isNotNav = !/(home|about|contact|news|blog|login|sign|privacy|terms)/i.test(innerText);
        
        if (isTitleCase && isPlausibleCompanyName && isNotNav) {
          externalLinks.add(cleanUrl);
        }
      }
    } catch (e) {
      // Invalid URL, skip
    }
    
    if (internalLinks.size + externalLinks.size >= maxPages) break;
  }
  
  const result = {
    internal: Array.from(internalLinks).slice(0, maxPages),
    external: Array.from(externalLinks).slice(0, Math.floor(maxPages / 2))
  };
  
  console.log(`Harvested ${result.internal.length} internal and ${result.external.length} external links from ${baseUrl}`);
  return result;
}

/**
 * Determines if a URL is a detail page rather than a listing page
 */
export function isDetailPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\/(portfolio|investments|companies?)\/[^\/\s#?]+\/?$/i.test(path);
  } catch {
    return false;
  }
}

/**
 * Quick initial scan to count investment links on root page for adaptive depth
 */
async function quickScanRootPage(
  url: string,
  apiKey: string,
  supabaseUrl: string,
  supabaseKey: string,
  cacheStats: CacheStats
): Promise<number> {
  console.log(`Quick scan of root page: ${url}`);
  
  let scrapeData = await getCachedResponse(supabaseUrl, supabaseKey, url, 'scrape-markdown');
  
  if (scrapeData) {
    cacheStats.hits++;
  } else {
    cacheStats.misses++;
    
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["html"],
        onlyMainContent: true,
        waitFor: 1000,
        timeout: 15000,
      }),
    });
    
    if (response.ok) {
      scrapeData = await response.json();
      await saveCachedResponse(supabaseUrl, supabaseKey, url, 'scrape-markdown', scrapeData);
    }
  }
  
  const html = scrapeData?.data?.html || scrapeData?.html || "";
  if (!html) return 0;
  
  // Count investment-related links
  const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>/gi;
  const matches = [...html.matchAll(linkPattern)];
  const investmentLinks = matches.filter(match => {
    const href = match[1].toLowerCase();
    return href.includes('portfolio') || href.includes('investment') || href.includes('company');
  });
  
  console.log(`Quick scan found ${investmentLinks.length} investment-related links`);
  return investmentLinks.length;
}

/**
 * Determines optimal crawl depth based on initial link density
 */
function calculateAdaptiveDepth(
  userDepth: number,
  linkCount: number
): { finalDepth: number; reason: string } {
  // High link density (≥10 links) → reduce depth to save credits
  if (linkCount >= 10) {
    const finalDepth = Math.min(userDepth, 2);
    return {
      finalDepth,
      reason: `High link density (${linkCount} links) - reduced depth to ${finalDepth} to optimize crawl`
    };
  }
  
  // Low link density (<3 links) → increase depth to find more
  if (linkCount < 3) {
    const finalDepth = Math.min(userDepth + 2, 5);
    return {
      finalDepth,
      reason: `Low link density (${linkCount} links) - increased depth to ${finalDepth} to discover more pages`
    };
  }
  
  // Medium density → use user preference
  return {
    finalDepth: userDepth,
    reason: `Normal link density (${linkCount} links) - using user depth ${userDepth}`
  };
}

/**
 * Initiates a Firecrawl crawl and polls until completion or timeout
 * Now with adaptive depth adjustment based on initial discovery
 */
export async function discoverInvestmentPages(
  url: string,
  apiKey: string,
  crawlDepthValue: number,
  maxPagesValue: number,
  rid: string,
  supabaseUrl: string,
  supabaseKey: string,
  cacheStats: CacheStats
): Promise<{
  success: boolean;
  error?: string;
  discoveredUrls: string[];
  listingPages: string[];
  detailPages: string[];
  isPartial: boolean;
  adaptiveDepth: number;
  adaptiveReason: string;
}> {
  console.log(`[${rid}] Step 1: Discovering investment pages...`);
  console.log(`JS-friendly options: onlyMainContent=true, waitFor=2000ms, timeout=25000ms`);
  
  // ADAPTIVE DEPTH: Quick scan root page to determine optimal depth
  console.log(`[${rid}] Adaptive crawl: scanning root page for link density...`);
  const rootLinkCount = await quickScanRootPage(url, apiKey, supabaseUrl, supabaseKey, cacheStats);
  const { finalDepth, reason } = calculateAdaptiveDepth(crawlDepthValue, rootLinkCount);
  
  console.log(`[${rid}] 📊 Adaptive depth decision: ${reason}`);
  console.log(`[${rid}] User requested depth: ${crawlDepthValue}, Final depth: ${finalDepth}`);
  
  const crawlCacheKey = `${url}_depth${finalDepth}_max${maxPagesValue}`;
  let cachedCrawlData = await getCachedResponse(supabaseUrl, supabaseKey, crawlCacheKey, 'crawl');
  
  let crawlInitData: any;
  let jobId: string;
  
  if (cachedCrawlData) {
    cacheStats.hits++;
    console.log("Using cached crawl results");
    crawlInitData = cachedCrawlData;
    jobId = crawlInitData.id;
  } else {
    cacheStats.misses++;
    
      const crawlRequestBody: any = {
        url: url,
        limit: maxPagesValue,
        maxDepth: finalDepth, // Use adaptive depth
        scrapeOptions: {
          formats: ["markdown", "html"],
          onlyMainContent: true,
          waitFor: 2000,
          timeout: 25000,
        },
      };

    console.log("Sending crawl request to Firecrawl API");
    const crawlInitResponse = await fetch(
      "https://api.firecrawl.dev/v1/crawl",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(crawlRequestBody),
      }
    );

    if (!crawlInitResponse.ok) {
      const errorText = await crawlInitResponse.text();
      const status = crawlInitResponse.status;
      console.error(`[${rid}] Firecrawl crawl API error: HTTP ${status}`, errorText);
      
      let errorMessage = `Firecrawl API error: ${errorText.substring(0, 200)}`;
      if (status === 401 || status === 403) {
        errorMessage = "Authentication failed - invalid or missing API key";
      } else if (status === 402) {
        errorMessage = "Out of API credits - please add more credits";
      } else if (status === 429) {
        errorMessage = "Rate limited - please retry later";
      }
      
      return {
        success: false,
        error: errorMessage,
        discoveredUrls: [],
        listingPages: [],
        detailPages: [],
        isPartial: false,
        adaptiveDepth: finalDepth,
        adaptiveReason: reason
      };
    }

    crawlInitData = await crawlInitResponse.json();
    
    if (!crawlInitData || !crawlInitData.id) {
      console.error("Invalid response from Firecrawl API:", crawlInitData);
      return {
        success: false,
        error: "Invalid response from Firecrawl API - no job ID received",
        discoveredUrls: [],
        listingPages: [],
        detailPages: [],
        isPartial: false,
        adaptiveDepth: finalDepth,
        adaptiveReason: reason
      };
    }
    
    jobId = crawlInitData.id;
    console.log("Crawl job initiated with ID:", jobId);
  }
  
  let crawlComplete = cachedCrawlData ? true : false;
  let discoveredUrls: string[] = [];
  let listingPages: string[] = [];
  let detailPages: string[] = [];
  
  if (cachedCrawlData) {
    if (cachedCrawlData.data && cachedCrawlData.data.length > 0) {
      discoveredUrls = cachedCrawlData.data
        .map((page: any) => page.metadata?.url)
        .filter((url: string) => url && (url.includes('/investment') || url.includes('/portfolio') || url.includes('/company')));
      
      discoveredUrls.forEach(pageUrl => {
        const urlPath = new URL(pageUrl).pathname.toLowerCase();
        const isListingPage = 
          pageUrl === url ||
          urlPath.endsWith('/portfolio') ||
          urlPath.endsWith('/portfolio/') ||
          urlPath.endsWith('/investments') ||
          urlPath.endsWith('/investments/') ||
          urlPath === '/portfolio' ||
          urlPath === '/portfolio/' ||
          urlPath === '/investments' ||
          urlPath === '/investments/';
        
        if (isListingPage) {
          listingPages.push(pageUrl);
        } else {
          detailPages.push(pageUrl);
        }
      });
      
      console.log(`[${rid}] Extracted ${discoveredUrls.length} URLs from cache (${listingPages.length} listing, ${detailPages.length} detail)`);
    }
  }
  
  const maxAttempts = 30;
  let attempts = 0;

  while (!crawlComplete && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;

    const statusResponse = await fetch(
      `https://api.firecrawl.dev/v1/crawl/${jobId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!statusResponse.ok) {
      console.error(`Error checking crawl status (attempt ${attempts}):`, statusResponse.status);
      const errorText = await statusResponse.text().catch(() => "Unable to read error");
      console.error("Status check error details:", errorText);
      continue;
    }

    try {
      const crawlData = await statusResponse.json();
      console.log(`[${rid}] Crawl status (attempt ${attempts}/${maxAttempts}):`, crawlData?.status, `- Completed: ${crawlData?.completed || 0}/${crawlData?.total || 0}`);
      
      if (crawlData.data && crawlData.data.length > 0) {
        const newUrls = crawlData.data
          .map((page: any) => page.metadata?.url)
          .filter((url: string) => url && (url.includes('/investment') || url.includes('/portfolio') || url.includes('/company')));
        
        const uniqueUrls = [...new Set([...discoveredUrls, ...newUrls])];
        if (uniqueUrls.length > discoveredUrls.length) {
          console.log(`[${rid}] Incrementally discovered ${uniqueUrls.length - discoveredUrls.length} new URLs`);
          discoveredUrls = uniqueUrls;
          
          listingPages = [];
          detailPages = [];
          
          discoveredUrls.forEach(pageUrl => {
            const urlPath = new URL(pageUrl).pathname.toLowerCase();
            
            const isListingPage = 
              pageUrl === url ||
              urlPath.endsWith('/portfolio') ||
              urlPath.endsWith('/portfolio/') ||
              urlPath.endsWith('/investments') ||
              urlPath.endsWith('/investments/') ||
              urlPath === '/portfolio' ||
              urlPath === '/portfolio/' ||
              urlPath === '/investments' ||
              urlPath === '/investments/';
            
            if (isListingPage) {
              listingPages.push(pageUrl);
            } else {
              detailPages.push(pageUrl);
            }
          });
          
          console.log(`[${rid}] Categorized URLs: ${listingPages.length} listing pages, ${detailPages.length} detail pages`);
        }
      }
      
      if (crawlData?.status === "completed") {
        crawlComplete = true;
        console.log(`[${rid}] Crawl completed with ${discoveredUrls.length} investment pages`);
        
        await saveCachedResponse(supabaseUrl, supabaseKey, crawlCacheKey, 'crawl', crawlData);
      } else if (crawlData?.status === "failed") {
        console.error(`[${rid}] Crawl job failed`);
        return {
          success: false,
          error: "Crawl job failed",
          discoveredUrls: [],
          listingPages: [],
          detailPages: [],
          isPartial: false,
          adaptiveDepth: finalDepth,
          adaptiveReason: reason
        };
      }
    } catch (jsonError) {
      console.error(`[${rid}] Failed to parse status response JSON (attempt ${attempts}):`, jsonError);
      continue;
    }
  }

  const isPartial = !crawlComplete;
  if (isPartial) {
    console.warn(`[${rid}] Crawl timeout after ${attempts} attempts (${attempts * 2}s), proceeding with ${discoveredUrls.length} partial URLs`);
  }
  
  if (discoveredUrls.length === 0) {
    console.error(`[${rid}] No URLs discovered after timeout`);
    return {
      success: false,
      error: `Crawl job timed out after ${attempts * 2} seconds with no results`,
      discoveredUrls: [],
      listingPages: [],
      detailPages: [],
      isPartial,
      adaptiveDepth: finalDepth,
      adaptiveReason: reason
    };
  }

  return {
    success: true,
    discoveredUrls,
    listingPages,
    detailPages,
    isPartial,
    adaptiveDepth: finalDepth,
    adaptiveReason: reason
  };
}
