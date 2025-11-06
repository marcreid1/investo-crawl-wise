/**
 * Firecrawl response caching layer (48-hour expiry)
 * Reduces API calls and costs by reusing recent scrape results
 */

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
