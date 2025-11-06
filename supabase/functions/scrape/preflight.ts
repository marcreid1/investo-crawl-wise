/**
 * Preflight validation to assess site suitability before expensive Firecrawl calls
 */

export interface PreflightResult {
  accessible: boolean;
  confidence: number; // 0-100 score
  contentType?: string;
  contentLength?: number;
  hasInvestmentSignals: boolean;
  htmlBased: boolean;
  reasons: string[];
  shouldUseBatch: boolean;
}

export interface DomainHealth {
  domain: string;
  successCount: number;
  failureCount: number;
  lastFailureType?: '503' | '429' | 'timeout' | 'other';
  lastChecked: number;
  consecutiveFailures: number;
}

const PREFLIGHT_TIMEOUT_MS = 5000;
const CONFIDENCE_THRESHOLD = 60;
const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB

// Investment-related keywords for content detection
const INVESTMENT_KEYWORDS = [
  'portfolio', 'investment', 'investments', 'company', 'companies',
  'fund', 'capital', 'equity', 'venture', 'private equity',
  'acquisition', 'holdings', 'partner', 'partners'
];

/**
 * Lightweight preflight check before calling Firecrawl
 */
export async function preflightCheck(
  url: string,
  requestId: string
): Promise<PreflightResult> {
  const result: PreflightResult = {
    accessible: false,
    confidence: 0,
    hasInvestmentSignals: false,
    htmlBased: false,
    reasons: [],
    shouldUseBatch: false,
  };

  try {
    console.log(`[${requestId}] 🔍 Preflight check for: ${url}`);

    // First try HEAD request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PREFLIGHT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; InvestmentScraper/1.0)',
        },
      });
    } catch (headError) {
      // If HEAD fails, try GET with limited range
      console.log(`[${requestId}] HEAD failed, trying GET...`);
      response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; InvestmentScraper/1.0)',
          'Range': 'bytes=0-10239', // Only fetch first 10KB
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    result.accessible = response.ok;
    if (!response.ok) {
      result.reasons.push(`HTTP ${response.status}`);
      return result;
    }

    result.confidence += 30; // Base points for accessibility

    // Check content type
    const contentType = response.headers.get('content-type') || '';
    result.contentType = contentType;
    result.htmlBased = contentType.includes('text/html') || contentType.includes('application/xhtml');

    if (result.htmlBased) {
      result.confidence += 25;
      result.reasons.push('HTML-based content');
    } else {
      result.reasons.push(`Non-HTML content: ${contentType}`);
      return result;
    }

    // Check content length
    const contentLengthStr = response.headers.get('content-length');
    if (contentLengthStr) {
      result.contentLength = parseInt(contentLengthStr, 10);
      if (result.contentLength > 0 && result.contentLength < MAX_CONTENT_SIZE) {
        result.confidence += 20;
        result.reasons.push(`Reasonable size: ${(result.contentLength / 1024).toFixed(1)}KB`);
      } else if (result.contentLength >= MAX_CONTENT_SIZE) {
        result.confidence -= 10;
        result.reasons.push(`Large page: ${(result.contentLength / 1024 / 1024).toFixed(1)}MB`);
      }
    }

    // Fetch partial content to check for investment signals
    const partialResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InvestmentScraper/1.0)',
        'Range': 'bytes=0-20479', // First 20KB
      },
    });

    if (partialResponse.ok) {
      const html = await partialResponse.text();
      const lowerHtml = html.toLowerCase();

      // Count investment-related keywords
      let keywordMatches = 0;
      const matchedKeywords: string[] = [];
      
      for (const keyword of INVESTMENT_KEYWORDS) {
        const regex = new RegExp(keyword, 'gi');
        const matches = lowerHtml.match(regex);
        if (matches) {
          keywordMatches += matches.length;
          matchedKeywords.push(keyword);
        }
      }

      result.hasInvestmentSignals = keywordMatches >= 3;
      
      if (result.hasInvestmentSignals) {
        result.confidence += 25;
        result.reasons.push(`Investment signals: ${matchedKeywords.slice(0, 3).join(', ')}`);
      } else {
        result.reasons.push('No clear investment signals');
      }
    }

    // Determine if batch mode should be used
    result.shouldUseBatch = result.confidence >= CONFIDENCE_THRESHOLD;

    console.log(`[${requestId}] ✅ Preflight confidence: ${result.confidence}/100 - ${result.shouldUseBatch ? 'BATCH MODE' : 'FALLBACK MODE'}`);
    console.log(`[${requestId}] Reasons: ${result.reasons.join('; ')}`);

  } catch (error) {
    console.error(`[${requestId}] ❌ Preflight error:`, error);
    result.reasons.push(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

/**
 * Domain-level health tracking to avoid problematic domains
 */
export class DomainHealthTracker {
  private cache: Map<string, DomainHealth> = new Map();
  private readonly FAILURE_THRESHOLD = 3; // Skip batch after 3 consecutive failures
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }

  recordSuccess(url: string): void {
    const domain = this.extractDomain(url);
    const health = this.cache.get(domain) || {
      domain,
      successCount: 0,
      failureCount: 0,
      lastChecked: Date.now(),
      consecutiveFailures: 0,
    };

    health.successCount++;
    health.consecutiveFailures = 0;
    health.lastChecked = Date.now();
    this.cache.set(domain, health);
  }

  recordFailure(url: string, failureType: '503' | '429' | 'timeout' | 'other'): void {
    const domain = this.extractDomain(url);
    const health = this.cache.get(domain) || {
      domain,
      successCount: 0,
      failureCount: 0,
      lastChecked: Date.now(),
      consecutiveFailures: 0,
    };

    health.failureCount++;
    health.consecutiveFailures++;
    health.lastFailureType = failureType;
    health.lastChecked = Date.now();
    this.cache.set(domain, health);
  }

  shouldSkipBatch(url: string): boolean {
    const domain = this.extractDomain(url);
    const health = this.cache.get(domain);

    if (!health) return false;

    // Skip if cache entry is too old
    if (Date.now() - health.lastChecked > this.CACHE_TTL_MS) {
      this.cache.delete(domain);
      return false;
    }

    // Skip batch if too many consecutive failures
    return health.consecutiveFailures >= this.FAILURE_THRESHOLD;
  }

  getHealth(url: string): DomainHealth | undefined {
    const domain = this.extractDomain(url);
    return this.cache.get(domain);
  }

  getAllHealth(): DomainHealth[] {
    return Array.from(this.cache.values());
  }
}
