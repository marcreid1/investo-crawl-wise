const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Text cleaning utilities
function cleanText(text: string): string {
  if (!text) return "";
  
  return text
    // Remove common page fragments
    .replace(/Investments\s*[-–—]\s*Page\s*\d+/gi, "")
    .replace(/Role\s*:\s*/gi, "")
    .replace(/Investment\s*:\s*/gi, "")
    .replace(/Portfolio\s*:\s*/gi, "")
    .replace(/Company\s*:\s*/gi, "")
    // Remove extra whitespace
    .replace(/\s+/g, " ")
    // Remove line breaks and tabs
    .replace(/[\r\n\t]+/g, " ")
    // Remove multiple spaces
    .replace(/\s{2,}/g, " ")
    // Trim
    .trim();
}

function cleanInvestment(investment: Investment): Investment {
  return {
    name: cleanText(investment.name),
    industry: investment.industry ? cleanText(investment.industry) : undefined,
    date: investment.date ? cleanText(investment.date) : undefined,
    description: investment.description ? cleanText(investment.description) : undefined,
    partners: investment.partners?.map(p => cleanText(p)).filter(p => p.length > 0),
    portfolioUrl: investment.portfolioUrl,
    sourceUrl: investment.sourceUrl,
  };
}

interface CrawlData {
  markdown?: string;
  html?: string;
  metadata?: {
    title?: string;
    description?: string;
    url?: string;
    [key: string]: any;
  };
}

interface CrawlStatusResponse {
  success: boolean;
  status: string;
  completed: number;
  total: number;
  creditsUsed: number;
  expiresAt: string;
  data?: CrawlData[];
}

interface Investment {
  name: string;
  industry?: string;
  date?: string;
  description?: string;
  partners?: string[];
  portfolioUrl?: string;
  sourceUrl: string;
}

// Helper function to extract investment data from HTML using CSS selectors
function extractInvestmentDataFromHTML(page: CrawlData): Investment[] {
  const investments: Investment[] = [];
  
  if (!page.html) {
    console.log(`Page ${page.metadata?.url || 'unknown'} has no HTML content`);
    return investments;
  }

  try {
    // Common CSS selector patterns for investment data
    const selectors = {
      // Row containers
      rows: [
        '.investment-row',
        '.portfolio-item',
        '.company-card',
        'tr.investment',
        '[data-investment]',
        '.portfolio-company',
      ],
      // Individual fields
      name: ['.name', '.company-name', '.title', 'h2', 'h3', '.investment-name'],
      industry: ['.industry', '.sector', '.category', '.vertical', '[data-industry]'],
      date: ['.date', '.investment-date', '.year', 'time', '[datetime]'],
      description: ['.description', '.summary', '.about', 'p'],
      partners: ['.partners', '.team', '.investors', '.lead'],
    };

    // Try to find investment rows
    let foundRows = false;
    for (const rowSelector of selectors.rows) {
      try {
        // Escape special regex characters in the selector
        const escapedSelector = rowSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '.');
        const selectorClass = escapedSelector.replace('.', '');
        const pattern = new RegExp(`<[^>]*class="[^"]*${selectorClass}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]*>`, 'gi');
        const matches = [...page.html.matchAll(pattern)];
        
        if (matches.length > 0) {
          foundRows = true;
          console.log(`Found ${matches.length} investment rows using selector: ${rowSelector} on page ${page.metadata?.url || 'unknown'}`);
          
          matches.forEach((match, index) => {
            try {
              const rowHtml = match[0];
              const investment: Investment = {
                name: '',
                sourceUrl: page.metadata?.url || "",
              };

              // Extract name
              for (const nameSelector of selectors.name) {
                try {
                  const escapedName = nameSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '.');
                  const nameClass = escapedName.replace('.', '');
                  const namePattern = new RegExp(`<[^>]*class="[^"]*${nameClass}[^"]*"[^>]*>([^<]+)<`, 'i');
                  const nameMatch = rowHtml.match(namePattern);
                  if (nameMatch && nameMatch[1]?.trim()) {
                    investment.name = nameMatch[1].trim();
                    break;
                  }
                } catch (err) {
                  console.warn(`Failed to match name selector ${nameSelector}:`, err);
                }
              }

              // Extract industry
              for (const industrySelector of selectors.industry) {
                try {
                  const escapedIndustry = industrySelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '.');
                  const industryClass = escapedIndustry.replace('.', '');
                  const industryPattern = new RegExp(`<[^>]*class="[^"]*${industryClass}[^"]*"[^>]*>([^<]+)<`, 'i');
                  const industryMatch = rowHtml.match(industryPattern);
                  if (industryMatch && industryMatch[1]?.trim()) {
                    investment.industry = industryMatch[1].trim();
                    break;
                  }
                } catch (err) {
                  console.warn(`Failed to match industry selector ${industrySelector}:`, err);
                }
              }

              // Extract date
              for (const dateSelector of selectors.date) {
                try {
                  const escapedDate = dateSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '.');
                  const dateClass = escapedDate.replace('.', '');
                  const datePattern = new RegExp(`<[^>]*class="[^"]*${dateClass}[^"]*"[^>]*>([^<]+)<`, 'i');
                  const dateMatch = rowHtml.match(datePattern);
                  if (dateMatch && dateMatch[1]?.trim()) {
                    investment.date = dateMatch[1].trim();
                    break;
                  }
                } catch (err) {
                  console.warn(`Failed to match date selector ${dateSelector}:`, err);
                }
              }

              // Extract description
              for (const descSelector of selectors.description) {
                try {
                  const escapedDesc = descSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '.');
                  const descClass = escapedDesc.replace('.', '');
                  const descPattern = new RegExp(`<[^>]*class="[^"]*${descClass}[^"]*"[^>]*>([^<]+)<`, 'i');
                  const descMatch = rowHtml.match(descPattern);
                  if (descMatch && descMatch[1]?.trim() && descMatch[1].trim().length > 20) {
                    investment.description = descMatch[1].trim();
                    break;
                  }
                } catch (err) {
                  console.warn(`Failed to match description selector ${descSelector}:`, err);
                }
              }

              investment.portfolioUrl = page.metadata?.url;

              if (investment.name) {
                investments.push(investment);
              } else {
                console.warn(`Row ${index} on page ${page.metadata?.url || 'unknown'} has no name, skipping`);
              }
            } catch (rowErr) {
              console.error(`Error processing row ${index}:`, rowErr);
              // Continue processing other rows
            }
          });
          
          if (investments.length > 0) {
            break; // Found valid data, no need to try other row selectors
          }
        }
      } catch (selectorErr) {
        console.error(`Error processing selector ${rowSelector}:`, selectorErr);
        // Continue with next selector
      }
    }

    // If no structured rows found, try extracting from links with common patterns
    if (!foundRows) {
      try {
        const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
        const links = [...page.html.matchAll(linkPattern)];
        
        console.log(`No structured rows found, trying link extraction. Found ${links.length} links on page ${page.metadata?.url || 'unknown'}`);
        
        links.forEach((link, index) => {
          try {
            const href = link[1];
            const text = link[2]?.trim();
            
            // Look for investment/portfolio/company links
            if (href && text && 
                (href.includes('portfolio') || href.includes('investment') || href.includes('company')) &&
                text.length > 3 && text.length < 100) {
              investments.push({
                name: text,
                sourceUrl: page.metadata?.url || "",
                portfolioUrl: href,
              });
            }
          } catch (linkErr) {
            console.error(`Error processing link ${index}:`, linkErr);
          }
        });
      } catch (linkExtractionErr) {
        console.error('Error during link extraction:', linkExtractionErr);
      }
    }

  } catch (error) {
    console.error(`Critical error extracting from HTML on page ${page.metadata?.url || 'unknown'}:`, error);
  }

  console.log(`Extracted ${investments.length} investments from HTML on page ${page.metadata?.url || 'unknown'}`);
  return investments;
}

// Helper function to extract investment data from text (fallback method)
function extractInvestmentDataFromText(page: CrawlData): Investment[] {
  const investments: Investment[] = [];
  
  try {
    const text = page.markdown || page.html || "";
    
    if (!text) {
      console.log(`Page ${page.metadata?.url || 'unknown'} has no text content`);
      return investments;
    }

    console.log(`Using text extraction for page ${page.metadata?.url || 'unknown'}`);
    
    // Common patterns for investment names (company names)
    const namePatterns = [
      /(?:portfolio|investment|company)(?:\s+(?:company|name))?[:\s]+([A-Z][A-Za-z0-9\s&.,-]{2,50})/gi,
      /(?:^|\n)([A-Z][A-Za-z0-9\s&.,-]{2,50})(?:\s*-\s*(?:portfolio|investment|company))/gim,
      /(?:invested\s+in|acquired|partnership\s+with)\s+([A-Z][A-Za-z0-9\s&.,-]{2,40})/gi,
    ];

    // Industry patterns
    const industryPatterns = [
      /(?:industry|sector|vertical|space|category)[:\s]+([A-Za-z\s&,-]{3,40})/gi,
      /(?:focused\s+on|specializing\s+in|operates\s+in)\s+([A-Za-z\s&,-]{3,40})/gi,
    ];

    // Date patterns
    const datePatterns = [
      /(?:invested|investment\s+date|date|acquired|exit)[:\s]+([A-Za-z]+\s+\d{4}|\d{1,2}\/\d{4}|\d{4})/gi,
      /(?:in|since)\s+(\d{4})/g,
    ];

    // Partner patterns
    const partnerPatterns = [
      /(?:partner|lead|team|led\s+by)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+\s+[A-Z][a-z]+)*)/gi,
    ];

    // Description patterns - look for sentences that describe the company
    const descriptionPatterns = [
      /(?:description|about|overview)[:\s]+([^.\n]{20,300}[.])/gi,
      /(?:is\s+a|provides|offers|develops|building)\s+([^.\n]{20,300}[.])/gi,
    ];

    // Extract data using patterns
    const names = new Set<string>();
    let name = page.metadata?.title || "";
    
    // Try to extract company names
    namePatterns.forEach((pattern, index) => {
      try {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          if (match[1] && match[1].trim().length > 2) {
            names.add(match[1].trim());
          }
        }
      } catch (patternErr) {
        console.warn(`Failed to match name pattern ${index}:`, patternErr);
      }
    });

    // If no names found, try using the page title
    if (names.size === 0 && name) {
      try {
        // Clean up the title
        name = name.replace(/\s*[-|]\s*.*/g, '').trim();
        if (name.length > 2 && name.length < 100) {
          names.add(name);
          console.log(`Using page title as investment name: ${name}`);
        }
      } catch (titleErr) {
        console.warn('Failed to process page title:', titleErr);
      }
    }

    // For each potential investment name, try to extract related data
    names.forEach((investmentName, index) => {
      try {
        const investment: Investment = {
          name: investmentName,
          sourceUrl: page.metadata?.url || "",
        };

        // Extract industry
        try {
          const industryMatches = [...text.matchAll(industryPatterns[0])];
          if (industryMatches.length > 0 && industryMatches[0][1]) {
            investment.industry = industryMatches[0][1].trim();
          }
        } catch (industryErr) {
          console.warn(`Failed to extract industry for ${investmentName}:`, industryErr);
        }

        // Extract date
        try {
          const dateMatches = [...text.matchAll(datePatterns[0])];
          if (dateMatches.length > 0 && dateMatches[0][1]) {
            investment.date = dateMatches[0][1].trim();
          }
        } catch (dateErr) {
          console.warn(`Failed to extract date for ${investmentName}:`, dateErr);
        }

        // Extract partners
        try {
          const partnerMatches = [...text.matchAll(partnerPatterns[0])];
          if (partnerMatches.length > 0 && partnerMatches[0][1]) {
            investment.partners = partnerMatches[0][1]
              .split(',')
              .map(p => p.trim())
              .filter(p => p.length > 0);
          }
        } catch (partnerErr) {
          console.warn(`Failed to extract partners for ${investmentName}:`, partnerErr);
        }

        // Extract description
        try {
          const descMatches = [...text.matchAll(descriptionPatterns[0])];
          if (descMatches.length > 0 && descMatches[0][1]) {
            investment.description = descMatches[0][1].trim();
          } else {
            // Fallback: use page description
            if (page.metadata?.description) {
              investment.description = page.metadata.description;
            }
          }
        } catch (descErr) {
          console.warn(`Failed to extract description for ${investmentName}:`, descErr);
        }

        // Portfolio URL is the source URL
        investment.portfolioUrl = page.metadata?.url;

        investments.push(investment);
      } catch (investmentErr) {
        console.error(`Error processing investment ${index} (${investmentName}):`, investmentErr);
      }
    });

    // If no structured data found but page has meaningful content, create a basic entry
    if (investments.length === 0 && page.metadata?.title) {
      try {
        console.log(`Creating basic entry from page metadata for ${page.metadata.url || 'unknown'}`);
        investments.push({
          name: page.metadata.title.replace(/\s*[-|]\s*.*/g, '').trim(),
          description: page.metadata.description || "",
          sourceUrl: page.metadata?.url || "",
          portfolioUrl: page.metadata?.url,
        });
      } catch (basicEntryErr) {
        console.error('Failed to create basic entry:', basicEntryErr);
      }
    }

  } catch (error) {
    console.error(`Critical error in text extraction for page ${page.metadata?.url || 'unknown'}:`, error);
  }

  console.log(`Extracted ${investments.length} investments from text on page ${page.metadata?.url || 'unknown'}`);
  return investments;
}

// Main extraction function that tries HTML selectors first, then falls back to text
function extractInvestmentData(page: CrawlData): Investment[] {
  try {
    console.log(`Starting extraction for page: ${page.metadata?.url || 'unknown'}`);
    
    // Try HTML selector-based extraction first (more reliable)
    const htmlInvestments = extractInvestmentDataFromHTML(page);
    if (htmlInvestments.length > 0) {
      console.log(`Extracted ${htmlInvestments.length} investments using CSS selectors from ${page.metadata?.url || 'unknown'}`);
      return htmlInvestments;
    }

    // Fall back to text/markdown extraction
    console.log(`No structured HTML found on ${page.metadata?.url || 'unknown'}, using text extraction`);
    return extractInvestmentDataFromText(page);
  } catch (error) {
    console.error(`Critical error in extractInvestmentData for ${page.metadata?.url || 'unknown'}:`, error);
    return []; // Return empty array instead of crashing
  }
}

// Deduplicate and merge investment data
function deduplicateInvestments(allInvestments: Investment[]): Investment[] {
  const investmentMap = new Map<string, Investment>();

  allInvestments.forEach(investment => {
    const key = investment.name.toLowerCase().trim();
    
    if (investmentMap.has(key)) {
      // Merge data, preferring non-empty values
      const existing = investmentMap.get(key)!;
      investmentMap.set(key, {
        name: existing.name,
        industry: existing.industry || investment.industry,
        date: existing.date || investment.date,
        description: (existing.description && existing.description.length > (investment.description?.length || 0)) 
          ? existing.description 
          : investment.description,
        partners: existing.partners || investment.partners,
        portfolioUrl: existing.portfolioUrl || investment.portfolioUrl,
        sourceUrl: existing.sourceUrl,
      });
    } else {
      investmentMap.set(key, investment);
    }
  });

  return Array.from(investmentMap.values());
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, crawlDepth, depth, renderJs, maxPages } = await req.json();

    if (!url || typeof url !== "string") {
      console.error("Invalid URL provided:", url);
      return new Response(
        JSON.stringify({ success: false, error: "Valid URL is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use provided depth (prefer 'depth', fallback to 'crawlDepth') or default to 2
    const crawlDepthValue = depth ?? crawlDepth ?? 2;
    const maxPagesValue = maxPages && typeof maxPages === "number" ? maxPages : 100;

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      console.error("FIRECRAWL_API_KEY not configured");
      return new Response(
        JSON.stringify({
          success: false,
          error: "API key not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Starting crawl for URL:", url);
    console.log(`Crawling with depth: ${crawlDepthValue}`);
    console.log(`Maximum pages: ${maxPagesValue}`);
    console.log(`JavaScript rendering: ${renderJs ? 'enabled' : 'disabled'}`);

    // Use Firecrawl v1 API format with pagination support
    const crawlRequestBody: any = {
      url: url,
      limit: maxPagesValue,
      scrapeOptions: {
        formats: ["markdown", "html"],
      },
      maxDepth: crawlDepthValue,
    };

    // Enable JavaScript rendering if requested
    if (renderJs) {
      crawlRequestBody.scrapeOptions.waitFor = 2000; // Wait for dynamic content
      crawlRequestBody.scrapeOptions.mobile = false;
    }

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
      console.error("Firecrawl API error:", crawlInitResponse.status, errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Firecrawl API error: ${errorText}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const crawlInitData = await crawlInitResponse.json();
    
    if (!crawlInitData || !crawlInitData.id) {
      console.error("Invalid response from Firecrawl API:", crawlInitData);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid response from Firecrawl API - no job ID received",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    
    const jobId = crawlInitData.id;
    console.log("Crawl job initiated with ID:", jobId);

    // Poll for crawl completion
    let crawlComplete = false;
    let crawlData: CrawlStatusResponse | null = null;
    const maxAttempts = 60; // Poll for up to 2 minutes
    let attempts = 0;

    while (!crawlComplete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between polls
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
        crawlData = await statusResponse.json();
        console.log(`Crawl status (attempt ${attempts}/${maxAttempts}):`, crawlData?.status, `- Completed: ${crawlData?.completed || 0}/${crawlData?.total || 0}`);
      } catch (jsonError) {
        console.error(`Failed to parse status response JSON (attempt ${attempts}):`, jsonError);
        continue;
      }

      if (crawlData?.status === "completed") {
        crawlComplete = true;
        console.log("Crawl completed successfully");
      } else if (crawlData?.status === "failed") {
        console.error("Crawl job failed with status:", crawlData);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Crawl job failed - check Firecrawl API status",
            details: crawlData,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (!crawlComplete || !crawlData) {
      console.error(`Crawl timeout after ${attempts} attempts (${attempts * 2} seconds)`);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Crawl job timed out after ${attempts * 2} seconds`,
          attemptsMade: attempts,
        }),
        {
          status: 408,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Crawl completed successfully. Pages crawled:", crawlData.completed, "Total:", crawlData.total, "Credits used:", crawlData.creditsUsed);

    // Parse investment data from each page with error resilience
    console.log("Parsing investment data from crawled pages...");
    const allInvestments: Investment[] = [];
    let successfulPages = 0;
    let failedPages = 0;
    
    if (crawlData.data && crawlData.data.length > 0) {
      console.log(`Processing ${crawlData.data.length} crawled pages`);
      
      crawlData.data.forEach((page, index) => {
        try {
          console.log(`Processing page ${index + 1}/${crawlData.data?.length || 0}: ${page.metadata?.url || 'unknown'}`);
          const investments = extractInvestmentData(page);
          
          if (investments.length > 0) {
            allInvestments.push(...investments);
            successfulPages++;
            console.log(`Successfully extracted ${investments.length} investments from page ${index + 1}`);
          } else {
            console.log(`No investments found on page ${index + 1}: ${page.metadata?.url || 'unknown'}`);
          }
        } catch (pageError) {
          failedPages++;
          console.error(`Failed to process page ${index + 1} (${page.metadata?.url || 'unknown'}):`, pageError);
          // Continue processing other pages
        }
      });
      
      console.log(`Page processing summary: ${successfulPages} successful, ${failedPages} failed`);
    } else {
      console.warn('No crawl data available to process');
    }

    // Deduplicate investments
    console.log(`Deduplicating ${allInvestments.length} total investments...`);
    const uniqueInvestments = deduplicateInvestments(allInvestments);
    console.log(`After deduplication: ${uniqueInvestments.length} unique investments`);
    
    // Clean all extracted text
    console.log("Cleaning extracted text...");
    const cleanedInvestments = uniqueInvestments.map(cleanInvestment);
    console.log(`Extracted and cleaned ${cleanedInvestments.length} unique investments`);

    // Always return structured JSON with data even if empty
    const responseData = {
      success: true,
      crawlStats: {
        completed: crawlData.completed || 0,
        total: crawlData.total || 0,
        creditsUsed: crawlData.creditsUsed || 0,
        successfulPages: successfulPages || 0,
        failedPages: failedPages || 0,
      },
      investments: cleanedInvestments || [],
      metadata: {
        url: url,
        crawlDepth: crawlDepthValue,
        maxPages: maxPagesValue,
        renderJs: renderJs || false,
        timestamp: new Date().toISOString(),
      },
    };

    console.log("Returning response with", cleanedInvestments.length, "investments");

    // Save to history database in background (don't await)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (supabaseUrl && supabaseKey) {
      console.log("Saving scraping history to database...");
      // Fire and forget - save history without blocking response
      fetch(`${supabaseUrl}/rest/v1/scraping_history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          url: url,
          investment_count: cleanedInvestments.length,
          pages_crawled: crawlData.completed,
          credits_used: crawlData.creditsUsed,
          investments_data: cleanedInvestments,
        }),
      })
      .then(res => {
        if (!res.ok) {
          console.error("Failed to save history - status:", res.status);
          return res.text().then(text => console.error("History save error details:", text));
        } else {
          console.log("History saved successfully");
        }
      })
      .catch(err => console.error("Error saving history:", err));
    } else {
      console.warn("Supabase credentials not available, skipping history save");
    }

    return new Response(
      JSON.stringify(responseData),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Critical error during crawl:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack available");
    
    // Always return structured JSON even on error
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
        errorType: error instanceof Error ? error.name : "Unknown",
        crawlStats: {
          completed: 0,
          total: 0,
          creditsUsed: 0,
          successfulPages: 0,
          failedPages: 0,
        },
        investments: [],
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
