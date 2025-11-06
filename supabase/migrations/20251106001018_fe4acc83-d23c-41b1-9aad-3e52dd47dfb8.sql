-- Create table for caching Firecrawl responses
CREATE TABLE IF NOT EXISTS public.firecrawl_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL, -- 'crawl', 'scrape-extract', 'scrape-markdown'
  response_data JSONB NOT NULL, -- Full Firecrawl response
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '48 hours')
);

-- Create index on url and content_type for fast lookups
CREATE INDEX idx_firecrawl_cache_url_type ON public.firecrawl_cache(url, content_type);

-- Create index on expires_at for cleanup queries
CREATE INDEX idx_firecrawl_cache_expires ON public.firecrawl_cache(expires_at);

-- Enable RLS (no user-specific data, but good practice)
ALTER TABLE public.firecrawl_cache ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access since this is server-side caching
CREATE POLICY "Allow anonymous read access" 
ON public.firecrawl_cache 
FOR SELECT 
USING (true);

CREATE POLICY "Allow anonymous insert access" 
ON public.firecrawl_cache 
FOR INSERT 
WITH CHECK (true);

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.firecrawl_cache
  WHERE expires_at < now();
END;
$$;

-- Optional: Create a trigger to auto-cleanup on insert (keeps table lean)
CREATE OR REPLACE FUNCTION public.auto_cleanup_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Every 100th insert, clean up expired entries
  IF (random() < 0.01) THEN
    PERFORM public.cleanup_expired_cache();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_cleanup_cache
AFTER INSERT ON public.firecrawl_cache
FOR EACH ROW
EXECUTE FUNCTION public.auto_cleanup_cache();