-- Create scraping progress tracking table
CREATE TABLE public.scraping_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id text NOT NULL UNIQUE,
  url text NOT NULL,
  current_stage text NOT NULL,
  stage_status text NOT NULL,
  stages jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.scraping_progress ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access"
ON public.scraping_progress
FOR SELECT
USING (true);

-- Allow public insert access
CREATE POLICY "Allow public insert access"
ON public.scraping_progress
FOR INSERT
WITH CHECK (true);

-- Allow public update access
CREATE POLICY "Allow public update access"
ON public.scraping_progress
FOR UPDATE
USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.scraping_progress;

-- Create index on request_id for faster lookups
CREATE INDEX idx_scraping_progress_request_id ON public.scraping_progress(request_id);

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION public.update_scraping_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_scraping_progress_updated_at
BEFORE UPDATE ON public.scraping_progress
FOR EACH ROW
EXECUTE FUNCTION public.update_scraping_progress_updated_at();