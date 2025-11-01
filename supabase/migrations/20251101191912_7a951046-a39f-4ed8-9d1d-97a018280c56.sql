-- Create scraping history table
CREATE TABLE public.scraping_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  investment_count INTEGER NOT NULL DEFAULT 0,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  investments_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.scraping_history ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to read and insert (since there's no auth)
CREATE POLICY "Allow public read access" 
ON public.scraping_history 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert access" 
ON public.scraping_history 
FOR INSERT 
WITH CHECK (true);

-- Create index on created_at for faster sorting
CREATE INDEX idx_scraping_history_created_at ON public.scraping_history(created_at DESC);

-- Create index on url for faster lookups
CREATE INDEX idx_scraping_history_url ON public.scraping_history(url);