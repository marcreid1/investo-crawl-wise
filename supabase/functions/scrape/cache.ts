/**
 * Firecrawl response caching layer (48-hour expiry)
 * Reduces API calls and costs by reusing recent scrape results
 * Now includes snapshot-aware fetching via /v1/snapshot
 */

/**
 * Checks if a snapshot exists and returns it if fresh (<48h old)
 * Otherwise triggers a new scrape
 */
export async function getOrFetchSnapshot(
  apiKey: string,
  url: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<any | null> {
  try {
    console.log(`Checking snapshot for: ${url}`);
    
    // Check if snapshot exists
    const snapshotResponse = await fetch(
      `https://api.firecrawl.dev/v1/snapshot?url=${encodeURIComponent(url)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (snapshotResponse.ok) {
      const snapshotData = await snapshotResponse.json();
      
      // Check if snapshot is fresh (<48h)
      if (snapshotData?.data?.timestamp) {
        const snapshotAge = Date.now() - new Date(snapshotData.data.timestamp).getTime();
        const hoursSinceSnapshot = snapshotAge / (1000 * 60 * 60);
        
        if (hoursSinceSnapshot < 48) {
          console.log(`✓ Fresh snapshot found (${Math.round(hoursSinceSnapshot)}h old)`);
          return snapshotData;
        }
        
        console.log(`Snapshot too old (${Math.round(hoursSinceSnapshot)}h), will trigger fresh scrape`);
      }
    } else {
      console.log(`No snapshot exists for ${url}`);
    }
    
    // No fresh snapshot - trigger new scrape
    console.log(`Triggering fresh scrape for ${url}`);
    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
        onlyMainContent: true,
        waitFor: 2000,
        timeout: 25000,
      }),
    });

    if (!scrapeResponse.ok) {
      console.error(`Scrape failed: ${scrapeResponse.status}`);
      return null;
    }

    const scrapeData = await scrapeResponse.json();
    
    // Cache the new scrape
    await saveCachedResponse(supabaseUrl, supabaseKey, url, 'scrape-snapshot', scrapeData);
    
    return scrapeData;
  } catch (error) {
    console.error('Snapshot fetch error:', error);
    return null;
  }
}

/**
 * Retrieves a cached Firecrawl response if available and not expired
 */
export async function getCachedResponse(
  supabaseUrl: string,
  supabaseKey: string,
  url: string,
  contentType: string
): Promise<any | null> {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data, error } = await supabase
      .from('firecrawl_cache')
      .select('*')
      .eq('url', url)
      .eq('content_type', contentType)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error('Cache lookup error:', error);
      return null;
    }
    
    if (data) {
      console.log(`✓ Cache HIT for ${contentType}: ${url}`);
      return data.response_data;
    }
    
    console.log(`✗ Cache MISS for ${contentType}: ${url}`);
    return null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Saves a Firecrawl response to cache with 48-hour expiry
 */
export async function saveCachedResponse(
  supabaseUrl: string,
  supabaseKey: string,
  url: string,
  contentType: string,
  responseData: any
): Promise<void> {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { error } = await supabase
      .from('firecrawl_cache')
      .insert({
        url,
        content_type: contentType,
        response_data: responseData,
      });
    
    if (error) {
      console.error('Cache save error:', error);
    } else {
      console.log(`✓ Cached ${contentType}: ${url} (expires in 48h)`);
    }
  } catch (error) {
    console.error('Cache save error:', error);
  }
}
