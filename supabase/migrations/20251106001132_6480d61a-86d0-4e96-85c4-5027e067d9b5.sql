-- Fix search_path for cache cleanup functions (drop trigger first)
DROP TRIGGER IF EXISTS trigger_auto_cleanup_cache ON public.firecrawl_cache;
DROP FUNCTION IF EXISTS public.auto_cleanup_cache();
DROP FUNCTION IF EXISTS public.cleanup_expired_cache();

-- Function to clean up expired cache entries with fixed search_path
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.firecrawl_cache
  WHERE expires_at < now();
END;
$$;

-- Auto-cleanup trigger function with fixed search_path
CREATE OR REPLACE FUNCTION public.auto_cleanup_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Every 100th insert, clean up expired entries
  IF (random() < 0.01) THEN
    PERFORM public.cleanup_expired_cache();
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER trigger_auto_cleanup_cache
AFTER INSERT ON public.firecrawl_cache
FOR EACH ROW
EXECUTE FUNCTION public.auto_cleanup_cache();