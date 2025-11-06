/**
 * Firecrawl Webhook Handler
 * Receives async crawl completion notifications and caches results
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload, null, 2));

    const { id: crawlId, status, data } = payload;

    if (!crawlId) {
      console.error("Missing crawl ID in webhook payload");
      return new Response(JSON.stringify({ error: "Missing crawl ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only process completed crawls
    if (status !== "completed") {
      console.log(`Crawl ${crawlId} status: ${status} - not caching yet`);
      return new Response(JSON.stringify({ acknowledged: true, status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache the completed crawl result
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Save crawl result to cache
    const { error } = await supabase
      .from('firecrawl_cache')
      .insert({
        url: `webhook-crawl-${crawlId}`,
        content_type: 'crawl-webhook',
        response_data: payload,
      });

    if (error) {
      console.error("Failed to cache webhook result:", error);
      return new Response(JSON.stringify({ error: "Cache failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✓ Cached webhook result for crawl ${crawlId}`);

    return new Response(JSON.stringify({ 
      acknowledged: true, 
      crawlId, 
      status,
      cached: true 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
