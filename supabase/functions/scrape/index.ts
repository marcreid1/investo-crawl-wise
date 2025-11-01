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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

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

    // Use Firecrawl v1 API to crawl the website
    const crawlRequestBody = {
      url: url,
      limit: 100,
      scrapeOptions: {
        formats: ["markdown", "html"],
        onlyMainContent: true,
      },
      crawlerOptions: {
        includes: ['*/investment*', '*/portfolio*', '*/companies*'],
        limit: 100,
        maxDepth: 3,
      }
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

    return new Response(
      JSON.stringify({
        success: true,
        data: crawlData,
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
