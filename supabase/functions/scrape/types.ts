/**
 * Shared TypeScript interfaces and types for the investment scraper
 */

export interface CrawlData {
  markdown?: string;
  html?: string;
  metadata?: {
    title?: string;
    description?: string;
    url?: string;
    [key: string]: any;
  };
}

export interface CrawlStatusResponse {
  success: boolean;
  status: string;
  completed: number;
  total: number;
  creditsUsed: number;
  expiresAt: string;
  data?: CrawlData[];
}

export interface Investment {
  name: string;
  industry?: string;
  date?: string;
  year?: string;
  description?: string;
  ceo?: string;
  investmentRole?: string;
  ownership?: string;
  location?: string;
  website?: string;
  status?: string;
  partners?: string[];
  portfolioUrl?: string;
  sourceUrl: string;
}

export interface CacheEntry {
  url: string;
  content_type: string;
  response_data: any;
  created_at: string;
  expires_at: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
}

export interface CrawlStrategy {
  userDepth: number;
  finalDepth: number;
  pagesRequested: number;
  pagesCrawled: number;
  batchedRequests: number;
  individualRequests: number;
  adaptiveReason?: string;
}

export interface ValidationResult {
  valid: boolean;
  confidence: number;
  missing: string[];
  method: string;
}

export interface StageInfo {
  name: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  message?: string;
  progress?: number;
  details?: {
    pagesDiscovered?: number;
    pagesProcessed?: number;
    investmentsFound?: number;
    cacheHits?: number;
    cacheMisses?: number;
  };
}

export interface ProgressState {
  validation: StageInfo;
  discovery: StageInfo;
  extraction: StageInfo;
  processing: StageInfo;
  complete: StageInfo;
}
