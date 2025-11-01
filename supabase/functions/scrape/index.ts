const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

// Helper function to extract investment data from text
function extractInvestmentData(page: CrawlData): Investment[] {
  const text = page.markdown || page.html || "";
  const investments: Investment[] = [];
  
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
  namePatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].trim().length > 2) {
        names.add(match[1].trim());
      }
    }
  });

  // If no names found, try using the page title
  if (names.size === 0 && name) {
    // Clean up the title
    name = name.replace(/\s*[-|]\s*.*/g, '').trim();
    if (name.length > 2 && name.length < 100) {
      names.add(name);
    }
  }

  // For each potential investment name, try to extract related data
  names.forEach(investmentName => {
    const investment: Investment = {
      name: investmentName,
      sourceUrl: page.metadata?.url || "",
    };

    // Extract industry
    const industryMatches = [...text.matchAll(industryPatterns[0])];
    if (industryMatches.length > 0) {
      investment.industry = industryMatches[0][1].trim();
    }

    // Extract date
    const dateMatches = [...text.matchAll(datePatterns[0])];
    if (dateMatches.length > 0) {
      investment.date = dateMatches[0][1].trim();
    }

    // Extract partners
    const partnerMatches = [...text.matchAll(partnerPatterns[0])];
    if (partnerMatches.length > 0) {
      investment.partners = partnerMatches[0][1]
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
    }

    // Extract description
    const descMatches = [...text.matchAll(descriptionPatterns[0])];
    if (descMatches.length > 0) {
      investment.description = descMatches[0][1].trim();
    } else {
      // Fallback: use page description
      if (page.metadata?.description) {
        investment.description = page.metadata.description;
      }
    }

    // Portfolio URL is the source URL
    investment.portfolioUrl = page.metadata?.url;

    investments.push(investment);
  });

  // If no structured data found but page has meaningful content, create a basic entry
  if (investments.length === 0 && page.metadata?.title) {
    investments.push({
      name: page.metadata.title.replace(/\s*[-|]\s*.*/g, '').trim(),
      description: page.metadata.description || "",
      sourceUrl: page.metadata?.url || "",
      portfolioUrl: page.metadata?.url,
    });
  }

  return investments;
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
    const { url, crawlDepth, depth, renderJs } = await req.json();

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
    console.log(`JavaScript rendering: ${renderJs ? 'enabled' : 'disabled'}`);

    // Use Firecrawl v1 API format with optional JS rendering
    const crawlRequestBody: any = {
      url: url,
      limit: 100,
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
          },
        }
      );

      if (!statusResponse.ok) {
        console.error("Error checking crawl status:", statusResponse.status);
        continue;
      }

      crawlData = await statusResponse.json();
      console.log(`Crawl status (attempt ${attempts}):`, crawlData?.status);

      if (crawlData?.status === "completed") {
        crawlComplete = true;
      } else if (crawlData?.status === "failed") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Crawl job failed",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (!crawlComplete || !crawlData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Crawl job timed out",
        }),
        {
          status: 408,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Crawl completed successfully. Pages crawled:", crawlData.completed);

    // Parse investment data from each page
    console.log("Parsing investment data from crawled pages...");
    const allInvestments: Investment[] = [];
    
    if (crawlData.data && crawlData.data.length > 0) {
      crawlData.data.forEach(page => {
        const investments = extractInvestmentData(page);
        allInvestments.push(...investments);
      });
    }

    // Deduplicate investments
    const uniqueInvestments = deduplicateInvestments(allInvestments);
    console.log(`Extracted ${uniqueInvestments.length} unique investments`);

    // Save to history database in background (don't await)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (supabaseUrl && supabaseKey) {
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
          investment_count: uniqueInvestments.length,
          pages_crawled: crawlData.completed,
          credits_used: crawlData.creditsUsed,
          investments_data: uniqueInvestments,
        }),
      })
      .then(res => {
        if (!res.ok) {
          console.error("Failed to save history:", res.status);
        } else {
          console.log("History saved successfully");
        }
      })
      .catch(err => console.error("Error saving history:", err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        crawlStats: {
          completed: crawlData.completed,
          total: crawlData.total,
          creditsUsed: crawlData.creditsUsed,
        },
        investments: uniqueInvestments,
        rawData: crawlData.data, // Include raw data for debugging
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error during crawl:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
