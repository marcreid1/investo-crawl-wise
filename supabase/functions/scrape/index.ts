const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Text cleaning utilities
function cleanText(text: string): string {
  if (!text) return "";
  
  return text
    // Remove common page fragments
    .replace(/Investments\s*[-–—]\s*Page\s*\d+/gi, "")
    .replace(/Role\s*:\s*/gi, "")
    .replace(/Investment\s*:\s*/gi, "")
    .replace(/Portfolio\s*:\s*/gi, "")
    .replace(/Company\s*:\s*/gi, "")
    // Remove extra whitespace
    .replace(/\s+/g, " ")
    // Remove line breaks and tabs
    .replace(/[\r\n\t]+/g, " ")
    // Remove multiple spaces
    .replace(/\s{2,}/g, " ")
    // Trim
    .trim();
}

function cleanInvestmentName(name: string): string {
  if (!name) return "";
  
  // Remove "– Ironbridge Equity Partners" suffix
  return name
    .replace(/\s*[-–—]\s*Ironbridge\s+Equity\s+Partners\s*$/i, "")
    .trim();
}

function normalizeIndustry(industry: string | undefined): string | undefined {
  if (!industry) return undefined;
  
  // If industry is too long or has too many commas, it's likely concatenated
  const commaCount = (industry.match(/,/g) || []).length;
  if (industry.length > 120 || commaCount > 4) {
    // Take only the first segment
    const firstSegment = industry.split(',')[0].trim();
    return firstSegment.length > 3 ? firstSegment : undefined;
  }
  
  return industry;
}

function cleanInvestment(investment: Investment): Investment {
  return {
    name: cleanInvestmentName(investment.name),
    industry: normalizeIndustry(investment.industry ? cleanText(investment.industry) : undefined),
    date: investment.date ? cleanText(investment.date) : undefined,
    year: investment.year ? cleanText(investment.year) : undefined,
    description: investment.description ? cleanText(investment.description) : undefined,
    ceo: investment.ceo ? cleanText(investment.ceo) : undefined,
    investmentRole: investment.investmentRole ? cleanText(investment.investmentRole) : undefined,
    ownership: investment.ownership ? cleanText(investment.ownership) : undefined,
    location: investment.location ? cleanText(investment.location) : undefined,
    website: investment.website ? cleanText(investment.website) : undefined,
    status: investment.status ? cleanText(investment.status) : undefined,
    partners: investment.partners?.map(p => cleanText(p)).filter(p => p.length > 0),
    portfolioUrl: investment.portfolioUrl,
    sourceUrl: investment.sourceUrl,
  };
}

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

interface Investment {
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

// ============= CACHE LAYER =============

interface CacheEntry {
  url: string;
  content_type: string;
  response_data: any;
  created_at: string;
  expires_at: string;
}

interface CacheStats {
  hits: number;
  misses: number;
}

// Helper: Get cached Firecrawl response
async function getCachedResponse(
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

// Helper: Save Firecrawl response to cache
async function saveCachedResponse(
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

// Helper to harvest detail page links from listing page HTML (internal + external)
function harvestDetailLinksFromHTML(html: string, baseUrl: string, maxPages: number = 50): { internal: string[], external: string[] } {
  if (!html) return { internal: [], external: [] };
  
  const internalLinks = new Set<string>();
  const externalLinks = new Set<string>();
  const base = new URL(baseUrl);
  
  // Match anchor tags with href and innerText
  const anchorPattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let match;
  
  while ((match = anchorPattern.exec(html)) !== null) {
    try {
      const href = match[1];
      const innerText = match[2].trim();
      
      // Build absolute URL
      let absoluteUrl: string;
      if (href.startsWith('http://') || href.startsWith('https://')) {
        absoluteUrl = href;
      } else if (href.startsWith('/')) {
        absoluteUrl = `${base.origin}${href}`;
      } else {
        continue; // Skip relative paths
      }
      
      const url = new URL(absoluteUrl);
      const cleanUrl = absoluteUrl.split('#')[0].split('?')[0]; // Remove hash and query
      
      // Internal detail pages (same domain)
      if (url.origin === base.origin) {
        const path = url.pathname.toLowerCase();
        // Match /portfolio/slug, /investments/slug, /company/slug, /companies/slug
        if (/\/(portfolio|investments|companies?)\/[^\/#?]+\/?$/i.test(path)) {
          // Exclude root listing pages
          if (!path.match(/\/(portfolio|investments|companies?)\/?$/i)) {
            internalLinks.add(cleanUrl);
          }
        }
      } else {
        // External company links (off-domain)
        // Heuristics: Title Case name, 2-4 words, < 60 chars, not common nav links
        const words = innerText.split(/\s+/).filter(w => w.length > 0);
        const isTitleCase = words.every(w => /^[A-Z]/.test(w));
        const isPlausibleCompanyName = words.length >= 2 && words.length <= 4 && innerText.length < 60;
        const isNotNav = !/(home|about|contact|news|blog|login|sign|privacy|terms)/i.test(innerText);
        
        if (isTitleCase && isPlausibleCompanyName && isNotNav) {
          externalLinks.add(cleanUrl);
        }
      }
    } catch (e) {
      // Invalid URL, skip
    }
    
    if (internalLinks.size + externalLinks.size >= maxPages) break;
  }
  
  const result = {
    internal: Array.from(internalLinks).slice(0, maxPages),
    external: Array.from(externalLinks).slice(0, Math.floor(maxPages / 2)) // Limit externals to half
  };
  
  console.log(`Harvested ${result.internal.length} internal and ${result.external.length} external links from ${baseUrl}`);
  return result;
}

// Helper to detect if URL is a detail page (not a listing)
function isDetailPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    // Only URLs ending with /portfolio/<slug> or /investments/<slug> are detail pages
    return /\/(portfolio|investments|companies?)\/[^\/\s#?]+\/?$/i.test(path);
  } catch {
    return false;
  }
}

// Helper function to extract investment data from HTML using CSS selectors
function extractInvestmentDataFromHTML(page: CrawlData): Investment[] {
  const investments: Investment[] = [];
  
  if (!page.html) {
    console.log(`Page ${page.metadata?.url || 'unknown'} has no HTML content`);
    return investments;
  }

  try {
    const pageUrl = page.metadata?.url || "";
    const pageTitle = page.metadata?.title || "";
    const pageDescription = page.metadata?.description || "";
    
    console.log(`Attempting structured extraction for: ${pageUrl}`);
    console.log(`Page title: ${pageTitle}`);
    
    // If this is a single investment detail page, extract from the whole page
    const isSingleInvestmentPage = isDetailPage(pageUrl);
    
    if (isSingleInvestmentPage && pageTitle) {
      console.log(`Detected single investment page, extracting from full content`);
      
      const investment: Investment = {
        name: cleanInvestmentName(pageTitle),
        sourceUrl: pageUrl,
        portfolioUrl: pageUrl,
      };
      
      // Extract from HTML content using broader patterns
      const htmlText = page.html;
      
      // Look for industry/sector anywhere in the content
      const industryMatches = htmlText.match(/<(?:div|span|p)[^>]*(?:class|id)="[^"]*(?:industry|sector|category|vertical)[^"]*"[^>]*>([^<]+)<|(?:Industry|Sector|Category|Vertical)[\s:]+<[^>]*>([^<]+)</i);
      if (industryMatches) {
        investment.industry = (industryMatches[1] || industryMatches[2] || '').trim();
        console.log(`Found industry: ${investment.industry}`);
      }
      
      // Look for CEO
      const ceoMatches = htmlText.match(/(?:CEO|President|Chief Executive)[\s:]+([A-Za-z\s\-'\.]+?)(?:<|$|\n|##)/i);
      if (ceoMatches) {
        investment.ceo = ceoMatches[1].trim();
        console.log(`Found CEO: ${investment.ceo}`);
      }
      
      // Look for Investment Role
      const roleMatches = htmlText.match(/(?:Ironbridge\s+Investment\s+Role|Investment\s+Role)[\s:]+([A-Za-z\s]+?)(?:<|$|\n|##)/i);
      if (roleMatches) {
        investment.investmentRole = roleMatches[1].trim();
        console.log(`Found investment role: ${investment.investmentRole}`);
      }
      
      // Look for Ownership
      const ownershipMatches = htmlText.match(/(?:Ironbridge\s+Ownership|Ownership)[\s:]+([A-Za-z\s]+?)(?:<|$|\n|##)/i);
      if (ownershipMatches) {
        investment.ownership = ownershipMatches[1].trim();
        console.log(`Found ownership: ${investment.ownership}`);
      }
      
      // Look for date/year anywhere
      const dateMatches = htmlText.match(/<(?:div|span|p|time)[^>]*(?:class|id)="[^"]*(?:date|year|invested)[^"]*"[^>]*>([^<]+)<|(?:Date|Year|Invested)[\s:]+<[^>]*>([^<]+)<|(?:Acquired|Investment Date)[\s:]+([0-9]{4}|[A-Za-z]+\s+[0-9]{4})/i);
      if (dateMatches) {
        investment.date = (dateMatches[1] || dateMatches[2] || dateMatches[3] || '').trim();
        console.log(`Found date: ${investment.date}`);
      }
      
      // Look for Year of Initial Investment
      const yearMatches = htmlText.match(/(?:Year\s+of\s+Initial\s+Investment|Investment\s+Year)[\s:]+(\d{4})/i);
      if (yearMatches) {
        investment.year = yearMatches[1].trim();
        console.log(`Found year: ${investment.year}`);
      }
      
      // Look for Location
      const locationMatches = htmlText.match(/(?:Location|Headquarters|Address)[\s:]+([A-Za-z\s,\-'\.]+?)(?:<|$|\n|##)/i);
      if (locationMatches) {
        investment.location = locationMatches[1].trim();
        console.log(`Found location: ${investment.location}`);
      }
      
      // Look for Website (URL)
      const websiteMatches = htmlText.match(/(?:Website)[\s:]+<?([a-z]+:\/\/[^\s<>\n]+)>?/i);
      if (websiteMatches) {
        investment.website = websiteMatches[1].trim();
        console.log(`Found website: ${investment.website}`);
      }
      
      // Look for Status
      const statusMatches = htmlText.match(/(?:Status|Investment\s+Status)[\s:]+([A-Za-z\s]+?)(?:<|$|\n|##)/i);
      if (statusMatches) {
        investment.status = statusMatches[1].trim();
        console.log(`Found status: ${investment.status}`);
      }
      
      // Extract description from meta or first paragraph
      if (pageDescription) {
        investment.description = pageDescription;
      } else {
        // Look for description in content
        const descMatches = htmlText.match(/<(?:div|p)[^>]*(?:class|id)="[^"]*(?:description|about|overview|content)[^"]*"[^>]*>([^<]{50,500})</i);
        if (descMatches) {
          investment.description = descMatches[1].trim();
          console.log(`Found description from HTML`);
        }
      }
      
      // Look for partners/team
      const partnerMatches = htmlText.match(/<(?:div|span|p)[^>]*(?:class|id)="[^"]*(?:partners|team|leadership|executives)[^"]*"[^>]*>([^<]+)</gi);
      if (partnerMatches && partnerMatches.length > 0) {
        investment.partners = partnerMatches
          .map(m => m.replace(/<[^>]*>/g, '').trim())
          .filter(p => p.length > 0 && p.length < 100);
        console.log(`Found ${investment.partners.length} partners`);
      }
      
      investments.push(investment);
      console.log(`Extracted single investment: ${investment.name}`);
      return investments;
    }

    // Try structured row extraction for list pages
    const selectors = {
      rows: [
        '.investment-row',
        '.portfolio-item',
        '.company-card',
        'tr.investment',
        '[data-investment]',
        '.portfolio-company',
      ],
      name: ['.name', '.company-name', '.title', 'h2', 'h3', '.investment-name'],
      industry: ['.industry', '.sector', '.category', '.vertical', '[data-industry]'],
      date: ['.date', '.investment-date', '.year', 'time', '[datetime]'],
      description: ['.description', '.summary', '.about', 'p'],
      partners: ['.partners', '.team', '.investors', '.lead'],
    };

    let foundRows = false;
    for (const rowSelector of selectors.rows) {
      try {
        const escapedSelector = rowSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '.');
        const selectorClass = escapedSelector.replace('.', '');
        const pattern = new RegExp(`<[^>]*class="[^"]*${selectorClass}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]*>`, 'gi');
        const matches = [...page.html.matchAll(pattern)];
        
        if (matches.length > 0) {
          foundRows = true;
          console.log(`Found ${matches.length} investment rows using selector: ${rowSelector}`);
          
          matches.forEach((match, index) => {
            try {
              const rowHtml = match[0];
              const investment: Investment = {
                name: '',
                sourceUrl: pageUrl,
              };

              for (const nameSelector of selectors.name) {
                try {
                  const escapedName = nameSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '.');
                  const nameClass = escapedName.replace('.', '');
                  const namePattern = new RegExp(`<[^>]*class="[^"]*${nameClass}[^"]*"[^>]*>([^<]+)<`, 'i');
                  const nameMatch = rowHtml.match(namePattern);
                  if (nameMatch && nameMatch[1]?.trim()) {
                    investment.name = nameMatch[1].trim();
                    break;
                  }
                } catch (err) {
                  console.warn(`Failed to match name selector ${nameSelector}:`, err);
                }
              }

              for (const industrySelector of selectors.industry) {
                try {
                  const escapedIndustry = industrySelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '.');
                  const industryClass = escapedIndustry.replace('.', '');
                  const industryPattern = new RegExp(`<[^>]*class="[^"]*${industryClass}[^"]*"[^>]*>([^<]+)<`, 'i');
                  const industryMatch = rowHtml.match(industryPattern);
                  if (industryMatch && industryMatch[1]?.trim()) {
                    investment.industry = industryMatch[1].trim();
                    break;
                  }
                } catch (err) {
                  console.warn(`Failed to match industry selector ${industrySelector}:`, err);
                }
              }

              for (const dateSelector of selectors.date) {
                try {
                  const escapedDate = dateSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '.');
                  const dateClass = escapedDate.replace('.', '');
                  const datePattern = new RegExp(`<[^>]*class="[^"]*${dateClass}[^"]*"[^>]*>([^<]+)<`, 'i');
                  const dateMatch = rowHtml.match(datePattern);
                  if (dateMatch && dateMatch[1]?.trim()) {
                    investment.date = dateMatch[1].trim();
                    break;
                  }
                } catch (err) {
                  console.warn(`Failed to match date selector ${dateSelector}:`, err);
                }
              }

              for (const descSelector of selectors.description) {
                try {
                  const escapedDesc = descSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '.');
                  const descClass = escapedDesc.replace('.', '');
                  const descPattern = new RegExp(`<[^>]*class="[^"]*${descClass}[^"]*"[^>]*>([^<]+)<`, 'i');
                  const descMatch = rowHtml.match(descPattern);
                  if (descMatch && descMatch[1]?.trim() && descMatch[1].trim().length > 20) {
                    investment.description = descMatch[1].trim();
                    break;
                  }
                } catch (err) {
                  console.warn(`Failed to match description selector ${descSelector}:`, err);
                }
              }

              investment.portfolioUrl = pageUrl;

              if (investment.name) {
                investments.push(investment);
              } else {
                console.warn(`Row ${index} has no name, skipping`);
              }
            } catch (rowErr) {
              console.error(`Error processing row ${index}:`, rowErr);
            }
          });
          
          if (investments.length > 0) {
            break;
          }
        }
      } catch (selectorErr) {
        console.error(`Error processing selector ${rowSelector}:`, selectorErr);
      }
    }

    // If no structured rows found, try link extraction
    if (!foundRows) {
      try {
        const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
        const links = [...page.html.matchAll(linkPattern)];
        
        console.log(`No structured rows found, found ${links.length} links`);
        
        links.forEach((link, index) => {
          try {
            const href = link[1];
            const text = link[2]?.trim();
            
            if (href && text && 
                (href.includes('portfolio') || href.includes('investment') || href.includes('company')) &&
                text.length > 3 && text.length < 100) {
              investments.push({
                name: text,
                sourceUrl: pageUrl,
                portfolioUrl: href,
              });
            }
          } catch (linkErr) {
            console.error(`Error processing link ${index}:`, linkErr);
          }
        });
      } catch (linkExtractionErr) {
        console.error('Error during link extraction:', linkExtractionErr);
      }
    }

  } catch (error) {
    console.error(`Critical error extracting from HTML:`, error);
  }

  console.log(`Extracted ${investments.length} investments from HTML`);
  return investments;
}

// Helper function to extract investment data from text (fallback method)
function extractInvestmentDataFromText(page: CrawlData): Investment[] {
  const investments: Investment[] = [];
  
  try {
    const text = page.markdown || page.html || "";
    const pageUrl = page.metadata?.url || "";
    const pageTitle = page.metadata?.title || "";
    const pageDescription = page.metadata?.description || "";
    
    if (!text) {
      console.log(`Page ${pageUrl} has no text content`);
      return investments;
    }

    console.log(`Using text extraction for page ${pageUrl}`);
    console.log(`Text length: ${text.length} characters`);
    
    // For single investment pages, extract from full content
    const isSingleInvestmentPage = isDetailPage(pageUrl);
    
    if (isSingleInvestmentPage && pageTitle) {
      console.log(`Single investment page detected, extracting full details`);
      
      const investment: Investment = {
        name: cleanInvestmentName(pageTitle),
        sourceUrl: pageUrl,
        portfolioUrl: pageUrl,
      };
      
      // Extract industry - look for various patterns
      const industryPatterns = [
        /(?:Industry|Sector|Category|Vertical|Market)[\s:]+([A-Za-z\s&,\/.-]{3,50})(?:\n|$|<)/i,
        /##\s*(?:Industry|Sector)[\s\n]+([A-Za-z\s&,\/.-]{3,50})/i,
        /\*\*(?:Industry|Sector)\*\*[\s:]+([A-Za-z\s&,\/.-]{3,50})/i,
      ];
      
      for (const pattern of industryPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.industry = match[1].trim();
          console.log(`Found industry: ${investment.industry}`);
          break;
        }
      }
      
      // Extract CEO
      const ceoPatterns = [
        /(?:CEO|Chief Executive Officer|President)[\s:]+([A-Za-z\s\-'\.]+?)(?:\n|$|##|\*\*)/i,
        /\*\*(?:CEO|President)\*\*[\s:]+([A-Za-z\s\-'\.]+?)(?:\n|$|##)/i,
      ];
      
      for (const pattern of ceoPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.ceo = match[1].trim();
          console.log(`Found CEO: ${investment.ceo}`);
          break;
        }
      }
      
      // Extract Investment Role
      const rolePatterns = [
        /(?:Ironbridge\s+Investment\s+Role|Investment\s+Role)[\s:]+([A-Za-z\s]+?)(?:\n|$|##|\*\*)/i,
        /\*\*(?:Investment\s+Role|Ironbridge\s+Investment\s+Role)\*\*[\s:]+([A-Za-z\s]+?)(?:\n|$|##)/i,
      ];
      
      for (const pattern of rolePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.investmentRole = match[1].trim();
          console.log(`Found investment role: ${investment.investmentRole}`);
          break;
        }
      }
      
      // Extract Ownership
      const ownershipPatterns = [
        /(?:Ironbridge\s+Ownership|Ownership)[\s:]+([A-Za-z\s]+?)(?:\n|$|##|\*\*)/i,
        /\*\*(?:Ownership|Ironbridge\s+Ownership)\*\*[\s:]+([A-Za-z\s]+?)(?:\n|$|##)/i,
      ];
      
      for (const pattern of ownershipPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.ownership = match[1].trim();
          console.log(`Found ownership: ${investment.ownership}`);
          break;
        }
      }
      
      // Extract date/year
      const datePatterns = [
        /(?:Investment Date|Date|Year|Acquired|Founded)[\s:]+([A-Za-z]+\s+\d{4}|\d{1,2}[\/\-]\d{4}|\d{4})/i,
        /##\s*(?:Date|Year)[\s\n]+([A-Za-z]+\s+\d{4}|\d{4})/i,
        /\*\*(?:Date|Year)\*\*[\s:]+([A-Za-z]+\s+\d{4}|\d{4})/i,
        /(?:Since|In)\s+(\d{4})/i,
      ];
      
      for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.date = match[1].trim();
          console.log(`Found date: ${investment.date}`);
          break;
        }
      }
      
      // Extract Year of Initial Investment
      const yearPatterns = [
        /(?:Year\s+of\s+Initial\s+Investment|Investment\s+Year)[\s:]+(\d{4})/i,
        /\*\*(?:Year\s+of\s+Initial\s+Investment)\*\*[\s:]+(\d{4})/i,
      ];
      
      for (const pattern of yearPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.year = match[1].trim();
          console.log(`Found year: ${investment.year}`);
          break;
        }
      }
      
      // Extract Location
      const locationPatterns = [
        /(?:Location|Headquarters|Address)[\s:]+([A-Za-z\s,\-'\.]+?)(?:\n|$|##|\*\*)/i,
        /\*\*(?:Location|Headquarters)\*\*[\s:]+([A-Za-z\s,\-'\.]+?)(?:\n|$|##)/i,
      ];
      
      for (const pattern of locationPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.location = match[1].trim();
          console.log(`Found location: ${investment.location}`);
          break;
        }
      }
      
      // Extract Website
      const websitePatterns = [
        /(?:Website)[\s:]+<?([a-z]+:\/\/[^\s<>\n]+)>?/i,
        /\*\*(?:Website)\*\*[\s:]+<?([a-z]+:\/\/[^\s<>\n]+)>?/i,
      ];
      
      for (const pattern of websitePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.website = match[1].trim();
          console.log(`Found website: ${investment.website}`);
          break;
        }
      }
      
      // Extract Status
      const statusPatterns = [
        /(?:Status|Investment\s+Status)[\s:]+([A-Za-z\s]+?)(?:\n|$|##|\*\*)/i,
        /\*\*(?:Status|Investment\s+Status)\*\*[\s:]+([A-Za-z\s]+?)(?:\n|$|##)/i,
      ];
      
      for (const pattern of statusPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.status = match[1].trim();
          console.log(`Found status: ${investment.status}`);
          break;
        }
      }
      
      // Extract description - prefer meta description, then look for paragraphs
      if (pageDescription && pageDescription.length > 30) {
        investment.description = pageDescription;
        console.log(`Using meta description`);
      } else {
        // Look for substantial paragraphs
        const descPatterns = [
          /(?:About|Overview|Description)[\s:]+([^\n]{50,500})/i,
          /##\s*(?:About|Overview)[\s\n]+([^\n]{50,500})/i,
          /^([A-Z][^\.!?]{100,500}[\.!?])/m, // First substantial sentence
        ];
        
        for (const pattern of descPatterns) {
          const match = text.match(pattern);
          if (match && match[1] && match[1].length > 50) {
            investment.description = match[1].trim();
            console.log(`Found description (${investment.description.length} chars)`);
            break;
          }
        }
      }
      
      // Extract partners/team members
      const partnerPatterns = [
        /(?:Partners?|Team|Leadership|Executives?)[\s:]+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s*[,;]\s*[A-Z][a-z]+\s+[A-Z][a-z]+)*)/i,
        /##\s*(?:Team|Leadership)[\s\n]+([A-Z][a-z\s,]+)/i,
      ];
      
      for (const pattern of partnerPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.partners = match[1]
            .split(/[,;]/)
            .map(p => p.trim())
            .filter(p => p.length > 3 && p.length < 100);
          if (investment.partners.length > 0) {
            console.log(`Found ${investment.partners.length} partners`);
            break;
          }
        }
      }
      
      investments.push(investment);
      console.log(`Created investment from single page: ${investment.name}`);
      return investments;
    }
    
    // For list pages, try to extract multiple investments
    console.log(`List page detected, extracting multiple investments`);
    
    const namePatterns = [
      /(?:##\s+|###\s+)([A-Z][A-Za-z0-9\s&.,-]{2,50})(?:\n|$)/gi,
      /\*\*([A-Z][A-Za-z0-9\s&.,-]{2,50})\*\*/gi,
      /(?:^|\n)([A-Z][A-Za-z0-9\s&.,-]{2,50})(?:\s*-\s*(?:Portfolio|Investment|Company))/gim,
    ];

    const names = new Set<string>();
    
    namePatterns.forEach((pattern, index) => {
      try {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          if (match[1] && match[1].trim().length > 2 && match[1].trim().length < 100) {
            names.add(match[1].trim());
          }
        }
      } catch (patternErr) {
        console.warn(`Failed to match name pattern ${index}:`, patternErr);
      }
    });

    // If no names found, use page title
    if (names.size === 0 && pageTitle) {
      try {
        const cleanTitle = pageTitle.replace(/\s*[-|–—]\s*.*/g, '').trim();
        if (cleanTitle.length > 2 && cleanTitle.length < 100) {
          names.add(cleanTitle);
          console.log(`Using page title as investment name: ${cleanTitle}`);
        }
      } catch (titleErr) {
        console.warn('Failed to process page title:', titleErr);
      }
    }

    console.log(`Found ${names.size} potential investment names`);

    // Create investment object for each name found
    names.forEach((investmentName, index) => {
      try {
        const investment: Investment = {
          name: investmentName,
          sourceUrl: pageUrl,
          portfolioUrl: pageUrl,
        };

        // Try to find nearby content (within 500 chars of the name)
        const nameIndex = text.indexOf(investmentName);
        if (nameIndex >= 0) {
          const contextStart = Math.max(0, nameIndex - 100);
          const contextEnd = Math.min(text.length, nameIndex + 500);
          const context = text.substring(contextStart, contextEnd);
          
          // Look for industry in context
          const industryMatch = context.match(/(?:Industry|Sector|Category)[\s:]+([A-Za-z\s&,\/.-]{3,40})/i);
          if (industryMatch && industryMatch[1]) {
            investment.industry = industryMatch[1].trim();
          }
          
          // Look for date in context
          const dateMatch = context.match(/(?:Date|Year|Since|In)[\s:]+([A-Za-z]+\s+\d{4}|\d{4})/i);
          if (dateMatch && dateMatch[1]) {
            investment.date = dateMatch[1].trim();
          }
          
          // Look for description nearby
          const descMatch = context.match(/([A-Z][^\.!?]{50,300}[\.!?])/);
          if (descMatch && descMatch[1]) {
            investment.description = descMatch[1].trim();
          }
        }

        // Use page description as fallback
        if (!investment.description && pageDescription) {
          investment.description = pageDescription;
        }

        investments.push(investment);
        console.log(`Created investment ${index + 1}: ${investmentName}`);
      } catch (investmentErr) {
        console.error(`Error processing investment ${index} (${investmentName}):`, investmentErr);
      }
    });

    // If still no investments, create basic entry from page metadata
    if (investments.length === 0 && pageTitle) {
      try {
        console.log(`Creating basic entry from page metadata`);
        investments.push({
          name: pageTitle.replace(/\s*[-|–—]\s*.*/g, '').trim(),
          description: pageDescription || "",
          sourceUrl: pageUrl,
          portfolioUrl: pageUrl,
        });
      } catch (basicEntryErr) {
        console.error('Failed to create basic entry:', basicEntryErr);
      }
    }

  } catch (error) {
    console.error(`Critical error in text extraction:`, error);
  }

  console.log(`Extracted ${investments.length} investments from text`);
  return investments;
}

// Main extraction function that tries HTML selectors first, then falls back to text
function extractInvestmentData(page: CrawlData): Investment[] {
  try {
    console.log(`Starting extraction for page: ${page.metadata?.url || 'unknown'}`);
    
    // Try HTML selector-based extraction first (more reliable)
    const htmlInvestments = extractInvestmentDataFromHTML(page);
    if (htmlInvestments.length > 0) {
      console.log(`Extracted ${htmlInvestments.length} investments using CSS selectors from ${page.metadata?.url || 'unknown'}`);
      return htmlInvestments;
    }

    // Fall back to text/markdown extraction
    console.log(`No structured HTML found on ${page.metadata?.url || 'unknown'}, using text extraction`);
    return extractInvestmentDataFromText(page);
  } catch (error) {
    console.error(`Critical error in extractInvestmentData for ${page.metadata?.url || 'unknown'}:`, error);
    return []; // Return empty array instead of crashing
  }
}

// Validate investment completeness and calculate confidence score
function validateInvestment(investment: Investment): { 
  valid: boolean; 
  confidence: number; 
  missing: string[];
  method: string;
} {
  const requiredFields = ['name'];
  const optionalFields = ['industry', 'ceo', 'website', 'year', 'location', 'status', 'investmentRole', 'ownership'];
  
  const missing: string[] = [];
  let filledOptional = 0;
  
  // Check required fields
  requiredFields.forEach(field => {
    if (!investment[field as keyof Investment]) {
      missing.push(field);
    }
  });
  
  // Count filled optional fields
  optionalFields.forEach(field => {
    const value = investment[field as keyof Investment];
    if (value && String(value).trim().length > 0) {
      filledOptional++;
    } else {
      missing.push(field);
    }
  });
  
  // Calculate confidence (percentage of optional fields filled)
  const confidence = Math.round((filledOptional / optionalFields.length) * 100);
  
  return {
    valid: missing.length === 0,
    confidence,
    missing,
    method: 'ai-extraction'
  };
}

// Apply fallback extraction using markdown patterns
function applyFallbackExtraction(investment: Investment, markdown?: string): Investment {
  if (!markdown) return investment;
  
  console.log(`Applying fallback extraction for: ${investment.name}`);
  
  // CEO fallback patterns
  if (!investment.ceo) {
    const ceoPatterns = [
      /(?:CEO|President|Chief Executive|Managing Director|President & CEO|President and CEO)[\s:]+([A-Za-z\s\-'\.]+?)(?:\n|##|<|$|\*\*)/i,
    ];
    
    for (const pattern of ceoPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1] && match[1].trim().length > 2 && match[1].trim().length < 50) {
        investment.ceo = match[1].trim();
        console.log(`  Fallback found CEO: ${investment.ceo}`);
        break;
      }
    }
  }
  
  // Industry fallback
  if (!investment.industry) {
    const industryPatterns = [
      /(?:Industry|Sector|Category|Vertical|Business)[\s:]+([A-Za-z\s&,\/\.-]{3,50})(?:\n|$|<|##|\*\*)/i,
    ];
    
    for (const pattern of industryPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1]) {
        investment.industry = match[1].trim();
        console.log(`  Fallback found industry: ${investment.industry}`);
        break;
      }
    }
  }
  
  // Year fallback
  if (!investment.year) {
    const yearPatterns = [
      /(?:Year\s+of\s+Initial\s+Investment|Investment\s+Year|Year Acquired|Initial Investment)[\s:]+(\d{4})/i,
      /(?:Since|In)\s+(\d{4})/i,
    ];
    
    for (const pattern of yearPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1]) {
        investment.year = match[1].trim();
        console.log(`  Fallback found year: ${investment.year}`);
        break;
      }
    }
  }
  
  // Location fallback
  if (!investment.location) {
    const locationPatterns = [
      /(?:Location|Headquarters|HQ|Based in)[\s:]+([A-Za-z\s,\-'\.]+?)(?:\n|$|##|\*\*)/i,
    ];
    
    for (const pattern of locationPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1] && match[1].trim().length > 2) {
        investment.location = match[1].trim();
        console.log(`  Fallback found location: ${investment.location}`);
        break;
      }
    }
  }
  
  // Website fallback
  if (!investment.website) {
    const websitePatterns = [
      /(?:Website|Web|URL)[\s:]+<?([a-z]+:\/\/[^\s<>\n]+)>?/i,
      /\[(?:Visit Website|Website|Company Site)\]\(([^)]+)\)/i,
    ];
    
    for (const pattern of websitePatterns) {
      const match = markdown.match(pattern);
      if (match && match[1]) {
        investment.website = match[1].trim();
        console.log(`  Fallback found website: ${investment.website}`);
        break;
      }
    }
  }
  
  // Status fallback
  if (!investment.status) {
    const statusPatterns = [
      /(?:Status|Investment Status)[\s:]+([A-Za-z\s()]+?)(?:\n|$|##|\*\*)/i,
    ];
    
    for (const pattern of statusPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1]) {
        investment.status = match[1].trim();
        console.log(`  Fallback found status: ${investment.status}`);
        break;
      }
    }
  }
  
  return investment;
}

// Deduplicate and merge investment data
function deduplicateInvestments(allInvestments: Investment[]): Investment[] {
  const investmentMap = new Map<string, Investment>();

  allInvestments.forEach(investment => {
    const key = investment.name.toLowerCase().trim();
    
    if (investmentMap.has(key)) {
      // Merge data, preferring non-empty values
      const existing = investmentMap.get(key)!;
      investmentMap.set(key, {
        name: existing.name,
        industry: existing.industry || investment.industry,
        date: existing.date || investment.date,
        year: existing.year || investment.year,
        ceo: existing.ceo || investment.ceo,
        investmentRole: existing.investmentRole || investment.investmentRole,
        ownership: existing.ownership || investment.ownership,
        location: existing.location || investment.location,
        website: existing.website || investment.website,
        status: existing.status || investment.status,
        description: (existing.description && existing.description.length > (investment.description?.length || 0)) 
          ? existing.description 
          : investment.description,
        partners: existing.partners || investment.partners,
        portfolioUrl: existing.portfolioUrl || investment.portfolioUrl,
        sourceUrl: existing.sourceUrl,
      });
    } else {
      investmentMap.set(key, investment);
    }
  });

  return Array.from(investmentMap.values());
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, crawlDepth, depth, renderJs, maxPages, requestId } = await req.json();

    const rid = requestId || crypto.randomUUID();
    console.log(`[${rid}] Request received for URL: ${url}`);
    console.log(`[${rid}] Firecrawl cache enabled (48-hour expiry)`);
    
    // Initialize cache stats
    const cacheStats: CacheStats = { hits: 0, misses: 0 };
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!url || typeof url !== "string") {
      console.error(`[${rid}] Invalid URL provided:`, url);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Valid URL is required",
          stage: "validation",
          statusCode: 400
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use provided depth (prefer 'depth', fallback to 'crawlDepth') or default to 2
    const crawlDepthValue = depth ?? crawlDepth ?? 2;
    const maxPagesValue = maxPages && typeof maxPages === "number" ? maxPages : 100;

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      console.error(`[${rid}] FIRECRAWL_API_KEY not configured`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "API key not configured",
          stage: "init",
          statusCode: 500
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[${rid}] Starting crawl for URL:`, url);
    console.log(`[${rid}] Crawling with depth: ${crawlDepthValue}`);
    console.log(`[${rid}] Maximum pages: ${maxPagesValue}`);
    console.log(`[${rid}] JavaScript rendering: ${renderJs ? 'enabled' : 'disabled'}`);

    // Use structured extraction mode
    console.log("Using Firecrawl structured extraction mode");
    
    // Schema for SINGLE investment detail pages
    const singleExtractionSchema = {
      type: "object",
      properties: {
        company_name: { 
          type: "string", 
          description: "The portfolio company name for THIS SPECIFIC PAGE ONLY. Look for the page title, main heading, or text near 'Company:', 'Portfolio Company:', or 'Investment:'. Remove any suffixes like '– [Firm Name]'." 
        },
        industry: { 
          type: "string", 
          description: "Industry for THIS SPECIFIC COMPANY ONLY. Look for labels like 'Industry:', 'Sector:', 'Category:', 'Vertical:', 'Business:', or 'Market:'. Return a single industry value, NOT a comma-separated list of multiple industries from different companies." 
        },
        ceo: { 
          type: "string", 
          description: "CEO or company leader name. Look for 'CEO:', 'President:', 'President & CEO:', 'Chief Executive Officer:', 'Managing Director:', 'Founder:', or 'Leadership:'. Extract just the person's name, not their title." 
        },
        investment_role: { 
          type: "string", 
          description: "The private equity firm's role in this investment. Look for '[Firm Name] Investment Role:', '[Firm Name] Role:', 'Investment Type:', or 'Transaction Type:'. Common values: 'Lead Investor', 'Co-Investor', 'Minority Partner', 'Strategic Investor', 'Control', 'Majority'." 
        },
        ownership: { 
          type: "string", 
          description: "Ownership stake or control level. Look for '[Firm Name] Ownership:', 'Ownership:', 'Stake:', or 'Position:'. Common values: 'Control', 'Majority', 'Minority', 'Significant Minority', or percentage like '65%'." 
        },
        year_of_initial_investment: { 
          type: "string", 
          description: "Year of first investment. Look for 'Year of Initial Investment:', 'Investment Year:', 'Year Acquired:', 'Initial Investment:', or 'Since:'. Extract just the 4-digit year (e.g., '2019', '2021')." 
        },
        location: { 
          type: "string", 
          description: "Company headquarters location. Look for 'Location:', 'Headquarters:', 'HQ:', 'Based in:', or 'City:'. Include city and state/province (e.g., 'Toronto, ON', 'New York, NY')." 
        },
        website: { 
          type: "string", 
          description: "Company website URL. Look for 'Website:', 'Web:', 'URL:', links with text like 'Visit Website', or any link that appears to be the company's main domain. Return the full URL starting with http:// or https://." 
        },
        status: { 
          type: "string", 
          description: "Investment status. Look for 'Status:', 'Investment Status:', or context clues. Common values: 'Current', 'Active', 'Exited', 'Realized', 'Divested', 'Sold', followed by year if exited (e.g., 'Exited (2020)')." 
        }
      },
      required: ["company_name"]
    };

    // Schema for LISTING pages (multiple investments on one page)
    const listingExtractionSchema = {
      type: "object",
      properties: {
        investments: {
          type: "array",
          description: "Array of ALL portfolio companies visible on this page. Each company should be a separate item in the array with its own distinct fields.",
          items: {
            type: "object",
            properties: {
              company_name: {
                type: "string",
                description: "Portfolio company name for THIS SPECIFIC COMPANY ONLY."
              },
              industry: {
                type: "string", 
                description: "Industry for THIS SPECIFIC COMPANY ONLY. Do NOT concatenate industries from multiple companies. Return a single industry value per company."
              },
              ceo: {
                type: "string",
                description: "CEO or leader for THIS SPECIFIC COMPANY ONLY."
              },
              investment_role: {
                type: "string",
                description: "Investment role for THIS SPECIFIC COMPANY. Values: 'Lead Investor', 'Co-Investor', 'Minority Partner', etc."
              },
              ownership: {
                type: "string",
                description: "Ownership for THIS SPECIFIC COMPANY. Values: 'Control', 'Majority', 'Minority', etc."
              },
              year_of_initial_investment: {
                type: "string",
                description: "Year of investment for THIS SPECIFIC COMPANY. Just the 4-digit year."
              },
              location: {
                type: "string",
                description: "Headquarters location for THIS SPECIFIC COMPANY."
              },
              website: {
                type: "string",
                description: "Website URL for THIS SPECIFIC COMPANY."
              },
              status: {
                type: "string",
                description: "Status for THIS SPECIFIC COMPANY. Values: 'Active', 'Exited', etc."
              }
            },
            required: ["company_name"]
          }
        }
      },
      required: ["investments"]
    };

    // First, crawl to discover all investment pages
    console.log("Step 1: Discovering investment pages...");
    console.log(`JS-friendly options: onlyMainContent=true, waitFor=2000ms, timeout=25000ms`);
    
    // Check cache for crawl results
    const crawlCacheKey = `${url}_depth${crawlDepthValue}_max${maxPagesValue}`;
    let cachedCrawlData = await getCachedResponse(supabaseUrl, supabaseKey, crawlCacheKey, 'crawl');
    
    let crawlInitData: any;
    let jobId: string;
    
    if (cachedCrawlData) {
      cacheStats.hits++;
      console.log("Using cached crawl results");
      crawlInitData = cachedCrawlData;
      jobId = crawlInitData.id; // Use cached job ID
    } else {
      cacheStats.misses++;
      
      const crawlRequestBody: any = {
        url: url,
        limit: maxPagesValue,
        maxDepth: crawlDepthValue,
        scrapeOptions: {
          formats: ["markdown", "html"],
          onlyMainContent: true,
          waitFor: 2000,
          timeout: 25000,
        },
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
        const status = crawlInitResponse.status;
        console.error(`[${rid}] Firecrawl crawl API error: HTTP ${status}`, errorText);
        
        let errorMessage = `Firecrawl API error: ${errorText.substring(0, 200)}`;
        if (status === 401 || status === 403) {
          errorMessage = "Authentication failed - invalid or missing API key";
        } else if (status === 402) {
          errorMessage = "Out of API credits - please add more credits";
        } else if (status === 429) {
          errorMessage = "Rate limited - please retry later";
        }
        
        return new Response(
          JSON.stringify({
            success: false,
            error: errorMessage,
            stage: "crawl-init",
            statusCode: status
          }),
          {
            status: status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      crawlInitData = await crawlInitResponse.json();
      
      if (!crawlInitData || !crawlInitData.id) {
        console.error("Invalid response from Firecrawl API:", crawlInitData);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid response from Firecrawl API - no job ID received",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      jobId = crawlInitData.id;
      console.log("Crawl job initiated with ID:", jobId);
    }
    
    // If using cached data, skip polling and use cached URLs directly
    let crawlComplete = cachedCrawlData ? true : false;
    let discoveredUrls: string[] = [];
    let listingPages: string[] = [];
    let detailPages: string[] = [];
    
    if (cachedCrawlData) {
      // Extract URLs from cached crawl data
      if (cachedCrawlData.data && cachedCrawlData.data.length > 0) {
        discoveredUrls = cachedCrawlData.data
          .map((page: any) => page.metadata?.url)
          .filter((url: string) => url && (url.includes('/investment') || url.includes('/portfolio') || url.includes('/company')));
        
        // Categorize URLs
        discoveredUrls.forEach(pageUrl => {
          const urlPath = new URL(pageUrl).pathname.toLowerCase();
          const isListingPage = 
            pageUrl === url ||
            urlPath.endsWith('/portfolio') ||
            urlPath.endsWith('/portfolio/') ||
            urlPath.endsWith('/investments') ||
            urlPath.endsWith('/investments/') ||
            urlPath === '/portfolio' ||
            urlPath === '/portfolio/' ||
            urlPath === '/investments' ||
            urlPath === '/investments/';
          
          if (isListingPage) {
            listingPages.push(pageUrl);
          } else {
            detailPages.push(pageUrl);
          }
        });
        
        console.log(`[${rid}] Extracted ${discoveredUrls.length} URLs from cache (${listingPages.length} listing, ${detailPages.length} detail)`);
      }
    }
    
    const maxAttempts = 30; // Poll for up to 60 seconds (30 * 2s)
    let attempts = 0;

    while (!crawlComplete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between polls
      attempts++;

      const statusResponse = await fetch(
        `https://api.firecrawl.dev/v1/crawl/${jobId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!statusResponse.ok) {
        console.error(`Error checking crawl status (attempt ${attempts}):`, statusResponse.status);
        const errorText = await statusResponse.text().catch(() => "Unable to read error");
        console.error("Status check error details:", errorText);
        continue;
      }

      try {
        const crawlData = await statusResponse.json();
        console.log(`[${rid}] Crawl status (attempt ${attempts}/${maxAttempts}):`, crawlData?.status, `- Completed: ${crawlData?.completed || 0}/${crawlData?.total || 0}`);
        
        // Collect URLs incrementally as they become available
        if (crawlData.data && crawlData.data.length > 0) {
          const newUrls = crawlData.data
            .map((page: any) => page.metadata?.url)
            .filter((url: string) => url && (url.includes('/investment') || url.includes('/portfolio') || url.includes('/company')));
          
          // Merge with existing URLs (deduplicate)
          const uniqueUrls = [...new Set([...discoveredUrls, ...newUrls])];
          if (uniqueUrls.length > discoveredUrls.length) {
            console.log(`[${rid}] Incrementally discovered ${uniqueUrls.length - discoveredUrls.length} new URLs`);
            discoveredUrls = uniqueUrls;
            
            // Categorize URLs into listing pages vs detail pages
            listingPages = [];
            detailPages = [];
            
            discoveredUrls.forEach(pageUrl => {
              const urlPath = new URL(pageUrl).pathname.toLowerCase();
              
              // Listing page indicators: ends with /portfolio, /portfolio/, /investments, or matches base URL
              const isListingPage = 
                pageUrl === url || // Exact match to crawl URL
                urlPath.endsWith('/portfolio') ||
                urlPath.endsWith('/portfolio/') ||
                urlPath.endsWith('/investments') ||
                urlPath.endsWith('/investments/') ||
                urlPath === '/portfolio' ||
                urlPath === '/portfolio/' ||
                urlPath === '/investments' ||
                urlPath === '/investments/';
              
              if (isListingPage) {
                listingPages.push(pageUrl);
              } else {
                detailPages.push(pageUrl);
              }
            });
            
            console.log(`[${rid}] Categorized URLs: ${listingPages.length} listing pages, ${detailPages.length} detail pages`);
          }
        }
        
        if (crawlData?.status === "completed") {
          crawlComplete = true;
          console.log(`[${rid}] Crawl completed with ${discoveredUrls.length} investment pages`);
          
          // Cache the completed crawl data for future use
          await saveCachedResponse(supabaseUrl, supabaseKey, crawlCacheKey, 'crawl', crawlData);
        } else if (crawlData?.status === "failed") {
          console.error(`[${rid}] Crawl job failed`);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Crawl job failed",
              stage: "crawl-status",
              statusCode: 500
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      } catch (jsonError) {
        console.error(`[${rid}] Failed to parse status response JSON (attempt ${attempts}):`, jsonError);
        continue;
      }
    }

    // Handle timeout with partial results
    const isPartial = !crawlComplete;
    if (isPartial) {
      console.warn(`[${rid}] Crawl timeout after ${attempts} attempts (${attempts * 2}s), proceeding with ${discoveredUrls.length} partial URLs`);
    }
    
    // If we have no URLs at all, return error
    if (discoveredUrls.length === 0) {
      console.error(`[${rid}] No URLs discovered after timeout`);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Crawl job timed out after ${attempts * 2} seconds with no results`,
          stage: "crawl-status",
          statusCode: 408,
          attemptsMade: attempts,
        }),
        {
          status: 408,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 2: Use structured extraction on each discovered page
    console.log(`[${rid}] Step 2: Extracting structured data from ${discoveredUrls.length} discovered pages...`);
    const allInvestments: Investment[] = [];
    const validationResults: any[] = [];
    let successfulPages = 0;
    let failedPages = 0;

    // Determine extraction strategy
    const shouldUseListingSchema = listingPages.length > 0 && detailPages.length === 0;
    if (shouldUseListingSchema) {
      console.log(`[${rid}] No detail pages found, will extract from ${listingPages.length} listing pages as arrays`);
    }

    // Process all pages (listing + detail)
    const pagesToProcess = shouldUseListingSchema ? listingPages : [...listingPages, ...detailPages];

    for (const pageUrl of pagesToProcess) {
      try {
        // Determine if this is a listing page
        const isListingPage = listingPages.includes(pageUrl);
        const schemaToUse = isListingPage ? listingExtractionSchema : singleExtractionSchema;
        const extractionType = isListingPage ? "listing (array)" : "detail (single)";
        
        console.log(`Extracting from ${extractionType} page: ${pageUrl}`);
        
        // Check cache first
        const scrapeCacheType = isListingPage ? 'scrape-listing' : 'scrape-detail';
        let scrapeData = await getCachedResponse(supabaseUrl, supabaseKey, pageUrl, scrapeCacheType);
        let scrapeResponseOk = true; // Track if response was successful
        
        if (scrapeData) {
          cacheStats.hits++;
        } else {
          cacheStats.misses++;
          
          const scrapeResponse = await fetch(
            "https://api.firecrawl.dev/v1/scrape",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url: pageUrl,
                formats: ["extract", "markdown", "html"],
                extract: {
                  schema: schemaToUse,
                },
                onlyMainContent: true,
                waitFor: 2000,
                timeout: 25000,
              }),
            }
          );

          scrapeResponseOk = scrapeResponse.ok;
          scrapeData = !scrapeResponse.ok ? null : await scrapeResponse.json();
          
          // Cache successful scrape results
          if (scrapeData && scrapeResponse.ok) {
            await saveCachedResponse(supabaseUrl, supabaseKey, pageUrl, scrapeCacheType, scrapeData);
          }
        }
        
        // Extract data from the correct Firecrawl v1 response structure
        const extracted = scrapeData?.data?.extract || scrapeData?.extract;
        const markdown = scrapeData?.data?.markdown || scrapeData?.markdown;
        const html = scrapeData?.data?.html || scrapeData?.html;
        
        // Determine if we need fallback extraction
        const needsFallback = !scrapeResponseOk || 
                              !scrapeData?.success || 
                              scrapeData?.code === 'SCRAPE_TIMEOUT' ||
                              !extracted;
        
        if (needsFallback) {
          if (!scrapeResponseOk) {
            console.error(`Failed to extract from ${pageUrl} (cache miss with error)`);
          } else if (!scrapeData?.success) {
            console.error(`scrapeData.success=false for ${pageUrl}, code=${scrapeData?.code}`);
          } else if (!extracted) {
            console.warn(`No extracted data present for ${pageUrl}`);
          }
          
          console.log(`Using markdown/HTML fallback extraction for ${pageUrl}`);
          
          let fallbackMarkdown = markdown;
          let fallbackHtml = html;
          
          // If we don't have markdown/html yet, fetch it
          if (!fallbackMarkdown && !fallbackHtml) {
            try {
              // Check cache for markdown
              let markdownData = await getCachedResponse(supabaseUrl, supabaseKey, pageUrl, 'scrape-markdown');
              
              if (markdownData) {
                cacheStats.hits++;
                fallbackMarkdown = markdownData?.data?.markdown || markdownData?.markdown;
                fallbackHtml = markdownData?.data?.html || markdownData?.html;
              } else {
                cacheStats.misses++;
                
                const markdownResponse = await fetch(
                  "https://api.firecrawl.dev/v1/scrape",
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${apiKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      url: pageUrl,
                      formats: ["markdown", "html"],
                      onlyMainContent: true,
                      waitFor: 2000,
                      timeout: 25000,
                    }),
                  }
                );
                
                if (markdownResponse.ok) {
                  markdownData = await markdownResponse.json();
                  fallbackMarkdown = markdownData?.data?.markdown || markdownData?.markdown;
                  fallbackHtml = markdownData?.data?.html || markdownData?.html;
                  
                  // Cache the markdown result
                  await saveCachedResponse(supabaseUrl, supabaseKey, pageUrl, 'scrape-markdown', markdownData);
                }
              }
            } catch (fetchError) {
              console.error(`Failed to fetch markdown/HTML for ${pageUrl}:`, fetchError);
            }
          }
          
          if (fallbackMarkdown || fallbackHtml) {
            console.log(`Successfully retrieved markdown/HTML for fallback (${fallbackMarkdown?.length || 0} chars markdown, ${fallbackHtml?.length || 0} chars HTML)`);
            
            const pageData = {
              markdown: fallbackMarkdown || "",
              html: fallbackHtml || "",
              metadata: { sourceURL: pageUrl, url: pageUrl }
            };
            
            let fallbackInvestments = extractInvestmentData(pageData);
            
            // If this is a listing page and we got few results, try harvesting detail links
            if (!isDetailPage(pageUrl) && fallbackInvestments.length < 3 && fallbackHtml) {
              console.log(`Listing page returned only ${fallbackInvestments.length} investments, attempting to harvest detail links...`);
              const harvested = harvestDetailLinksFromHTML(fallbackHtml, pageUrl, maxPagesValue);
              
              console.log(`Harvested ${harvested.internal.length} internal links, ${harvested.external.length} external links`);
              
              if (harvested.internal.length > 0) {
                console.log(`Processing ${harvested.internal.length} internal detail page links...`);
                
                // Extract from each harvested internal detail page
                for (const detailUrl of harvested.internal) {
                  try {
                    const detailResponse = await fetch(
                      "https://api.firecrawl.dev/v1/scrape",
                      {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${apiKey}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          url: detailUrl,
                          formats: ["extract", "markdown", "html"],
                          extract: {
                            schema: singleExtractionSchema,
                          },
                          onlyMainContent: true,
                          waitFor: 2000,
                          timeout: 25000,
                        }),
                      }
                    );
                    
                    if (detailResponse.ok) {
                      const detailData = await detailResponse.json();
                      const detailExtracted = detailData?.data?.extract || detailData?.extract;
                      
                      if (detailExtracted?.company_name) {
                        const investment: Investment = {
                          name: cleanInvestmentName(detailExtracted.company_name),
                          industry: detailExtracted.industry,
                          ceo: detailExtracted.ceo,
                          investmentRole: detailExtracted.investment_role,
                          ownership: detailExtracted.ownership,
                          year: detailExtracted.year_of_initial_investment,
                          location: detailExtracted.location,
                          website: detailExtracted.website,
                          status: detailExtracted.status,
                          sourceUrl: detailUrl,
                          portfolioUrl: detailUrl,
                        };
                        
                        fallbackInvestments.push(investment);
                        console.log(`  Harvested internal: ${investment.name} from ${detailUrl}`);
                      }
                    }
                  } catch (detailError) {
                    console.error(`Failed to extract from harvested internal detail page ${detailUrl}:`, detailError);
                  }
                }
              }
              
              // Process external company sites (lightweight extraction)
              if (harvested.external.length > 0) {
                console.log(`Processing ${harvested.external.length} external company sites (lightweight extraction)...`);
                
                for (const externalUrl of harvested.external) {
                  try {
                    const externalResponse = await fetch(
                      "https://api.firecrawl.dev/v1/scrape",
                      {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${apiKey}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          url: externalUrl,
                          formats: ["markdown", "html"],
                          onlyMainContent: true,
                          waitFor: 1500,
                          timeout: 20000,
                        }),
                      }
                    );
                    
                    if (externalResponse.ok) {
                      const externalData = await externalResponse.json();
                      const externalMarkdown = externalData?.data?.markdown || externalData?.markdown || "";
                      const externalHtml = externalData?.data?.html || externalData?.html || "";
                      
                      // Extract basic info from external site
                      const titleMatch = externalHtml.match(/<title>([^<]+)<\/title>/i);
                      const metaDescMatch = externalHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
                      const h1Match = externalHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
                      
                      const name = (h1Match?.[1] || titleMatch?.[1] || "").trim();
                      const description = metaDescMatch?.[1] || externalMarkdown.split('\n').find((line: string) => line.length > 50 && line.length < 300)?.trim();
                      
                      if (name) {
                        const investment: Investment = {
                          name: cleanInvestmentName(name),
                          website: externalUrl,
                          description: description,
                          sourceUrl: pageUrl,
                          portfolioUrl: pageUrl,
                        };
                        
                        fallbackInvestments.push(investment);
                        console.log(`  Harvested external: ${investment.name} from ${externalUrl}`);
                      }
                    }
                  } catch (externalError) {
                    console.error(`Failed to extract from external site ${externalUrl}:`, externalError);
                  }
                }
              }
            }
            
            console.log(`Fallback extraction returned ${fallbackInvestments.length} investments from ${pageUrl}`);
            
            for (const investment of fallbackInvestments) {
              investment.sourceUrl = pageUrl;
              investment.portfolioUrl = pageUrl;
              
              const validation = validateInvestment(investment);
              const method = investment.website && !investment.website.includes(new URL(pageUrl).hostname) 
                ? 'harvested-external' 
                : 'fallback-markdown';
              console.log(`  - ${investment.name}: ${validation.confidence}% confidence (${method})`);
              
              validationResults.push({
                name: investment.name,
                confidence: validation.confidence,
                missing: validation.missing,
                method: method
              });
              
              if (investment.name) {
                allInvestments.push(investment);
              }
            }
            
            if (fallbackInvestments.length > 0) {
              successfulPages++;
            } else {
              failedPages++;
            }
            continue;
          } else {
            console.error(`No markdown or HTML available for fallback extraction from ${pageUrl}`);
            failedPages++;
            continue;
          }
        }

        // AI extraction succeeded
        if (extracted) {
          console.log(`Extracted data:`, JSON.stringify(extracted));
          console.log(`Markdown length: ${markdown?.length || 0} chars`);
          
          // Handle listing page (array) vs detail page (single)
          if (isListingPage && extracted.investments && Array.isArray(extracted.investments)) {
            console.log(`Listing page extraction returned ${extracted.investments.length} investments`);
            
            for (const investmentData of extracted.investments) {
              let investment: Investment = {
                name: cleanInvestmentName(investmentData.company_name || ""),
                industry: investmentData.industry,
                ceo: investmentData.ceo,
                investmentRole: investmentData.investment_role,
                ownership: investmentData.ownership,
                year: investmentData.year_of_initial_investment,
                location: investmentData.location,
                website: investmentData.website,
                status: investmentData.status,
                sourceUrl: pageUrl,
                portfolioUrl: pageUrl,
              };

              // Apply fallback extraction for missing fields
              investment = applyFallbackExtraction(investment, markdown);
              
              // Validate and calculate confidence
              const validation = validateInvestment(investment);
              console.log(`  - ${investment.name}: ${validation.confidence}% confidence`);
              
              validationResults.push({
                name: investment.name,
                confidence: validation.confidence,
                missing: validation.missing,
                method: 'ai-listing'
              });

              if (investment.name) {
                allInvestments.push(investment);
              }
            }
            successfulPages++;
          } else {
            // Single investment extraction (detail page)
            let investment: Investment = {
              name: cleanInvestmentName(extracted.company_name || ""),
              industry: extracted.industry,
              ceo: extracted.ceo,
              investmentRole: extracted.investment_role,
              ownership: extracted.ownership,
              year: extracted.year_of_initial_investment,
              location: extracted.location,
              website: extracted.website,
              status: extracted.status,
              sourceUrl: pageUrl,
              portfolioUrl: pageUrl,
            };

            // Apply fallback extraction for missing fields
            investment = applyFallbackExtraction(investment, markdown);
            
            // Validate and calculate confidence
            const validation = validateInvestment(investment);
            console.log(`Extraction quality for ${investment.name}:`);
            console.log(`  - Confidence: ${validation.confidence}%`);
            console.log(`  - Missing fields: ${validation.missing.join(', ')}`);
            console.log(`  - Method: ${isListingPage ? 'Listing array' : 'Detail page'} + fallback`);
            
            validationResults.push({
              name: investment.name,
              confidence: validation.confidence,
              missing: validation.missing,
              method: 'ai-detail'
            });

            if (investment.name) {
              allInvestments.push(investment);
              successfulPages++;
              console.log(`Successfully extracted: ${investment.name}`);
            } else {
              console.warn(`Extraction returned empty name for ${pageUrl}`);
              console.warn(`Full extraction data:`, JSON.stringify(extracted));
              failedPages++;
            }
          }
        } else {
          console.warn(`No structured data extracted from ${pageUrl}`);
          console.warn(`Response success: ${scrapeData?.success}, has extract: ${!!extracted}`);
          console.warn(`Available keys: ${Object.keys(scrapeData || {}).join(', ')}`);
          failedPages++;
        }
      } catch (error) {
        console.error(`Error extracting from ${pageUrl}:`, error);
        failedPages++;
      }
    }

    console.log(`Extraction summary: ${successfulPages} successful, ${failedPages} failed`);
    
    // FINAL GLOBAL FALLBACK: If we still have zero investments, force one last pass
    if (allInvestments.length === 0) {
      console.warn(`Zero investments extracted - triggering final global fallback on ${url}`);
      
      try {
        const finalFallbackResponse = await fetch(
          "https://api.firecrawl.dev/v1/scrape",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: url,
              formats: ["markdown", "html"],
              onlyMainContent: true,
              waitFor: 2000,
              timeout: 25000,
            }),
          }
        );
        
        if (finalFallbackResponse.ok) {
          const finalData = await finalFallbackResponse.json();
          const finalMarkdown = finalData?.data?.markdown || finalData?.markdown || "";
          const finalHtml = finalData?.data?.html || finalData?.html || "";
          
          console.log(`Final fallback: fetched ${finalMarkdown.length} chars markdown, ${finalHtml.length} chars HTML`);
          
          // Try harvesting links again
          if (finalHtml) {
            const finalHarvested = harvestDetailLinksFromHTML(finalHtml, url, maxPagesValue);
            console.log(`Final harvest: ${finalHarvested.internal.length} internal, ${finalHarvested.external.length} external links`);
            
            // Try extracting from harvested links
            for (const link of [...finalHarvested.internal, ...finalHarvested.external].slice(0, 10)) {
              try {
                const linkResponse = await fetch(
                  "https://api.firecrawl.dev/v1/scrape",
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${apiKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      url: link,
                      formats: ["markdown", "html"],
                      onlyMainContent: true,
                      waitFor: 1500,
                      timeout: 20000,
                    }),
                  }
                );
                
                if (linkResponse.ok) {
                  const linkData = await linkResponse.json();
                  const linkMarkdown = linkData?.data?.markdown || linkData?.markdown || "";
                  const linkHtml = linkData?.data?.html || linkData?.html || "";
                  
                  const pageData = {
                    markdown: linkMarkdown,
                    html: linkHtml,
                    metadata: { sourceURL: link, url: link }
                  };
                  
                  const extractedFromLink = extractInvestmentData(pageData);
                  if (extractedFromLink.length > 0) {
                    extractedFromLink.forEach(inv => {
                      inv.sourceUrl = url;
                      inv.portfolioUrl = url;
                      allInvestments.push(inv);
                    });
                    console.log(`Final fallback extracted ${extractedFromLink.length} from ${link}`);
                  }
                }
              } catch (linkError) {
                console.error(`Final fallback link extraction error for ${link}:`, linkError);
              }
            }
          }
          
          // If still empty, create minimal entry from page title
          if (allInvestments.length === 0) {
            const titleMatch = finalHtml.match(/<title>([^<]+)<\/title>/i);
            const metaDescMatch = finalHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
            
            if (titleMatch?.[1]) {
              console.log("Creating minimal entry from page title as last resort");
              allInvestments.push({
                name: cleanInvestmentName(titleMatch[1]),
                description: metaDescMatch?.[1],
                sourceUrl: url,
                portfolioUrl: url,
              });
              
              validationResults.push({
                name: titleMatch[1],
                confidence: 20,
                missing: ['industry', 'ceo', 'year', 'location', 'website'],
                method: 'global-fallback-title'
              });
            }
          }
        }
      } catch (finalError) {
        console.error("Final global fallback failed:", finalError);
      }
    }
    
    // Calculate extraction method statistics
    const aiExtractions = validationResults.filter(v => v.method?.startsWith('ai-'));
    const fallbackExtractions = validationResults.filter(v => v.method === 'fallback-markdown');
    const harvestedExtractions = validationResults.filter(v => v.method?.includes('harvested'));
    const avgAiConfidence = aiExtractions.length > 0
      ? Math.round(aiExtractions.reduce((sum, v) => sum + v.confidence, 0) / aiExtractions.length)
      : 0;
    const avgFallbackConfidence = fallbackExtractions.length > 0
      ? Math.round(fallbackExtractions.reduce((sum, v) => sum + v.confidence, 0) / fallbackExtractions.length)
      : 0;
    
    // Calculate average confidence
    const avgConfidence = validationResults.length > 0
      ? Math.round(validationResults.reduce((sum, v) => sum + v.confidence, 0) / validationResults.length)
      : 0;
    
    console.log(`Extraction methods breakdown:`);
    console.log(`  AI: ${aiExtractions.length} (avg ${avgAiConfidence}%)`);
    console.log(`  Markdown fallback: ${fallbackExtractions.length} (avg ${avgFallbackConfidence}%)`);
    console.log(`  Harvested (internal+external): ${harvestedExtractions.length}`);
    console.log(`  Total validations: ${validationResults.length}`);
    console.log(`Overall average extraction confidence: ${avgConfidence}%`);
    
    const incompleteInvestments = validationResults.filter(v => v.confidence < 70).length;
    if (incompleteInvestments > 0) {
      console.warn(`${incompleteInvestments} investments have confidence below 70%`);
    }

    // Deduplicate investments
    console.log(`Deduplicating ${allInvestments.length} total investments...`);
    const uniqueInvestments = deduplicateInvestments(allInvestments);
    console.log(`After deduplication: ${uniqueInvestments.length} unique investments`);
    
    // Clean all extracted text
    console.log("Cleaning extracted text...");
    const cleanedInvestments = uniqueInvestments.map(cleanInvestment);
    console.log(`Extracted and cleaned ${cleanedInvestments.length} unique investments`);

    // Always return structured JSON with data even if empty
    const responseData = {
      success: true,
      partial: isPartial,
      crawlStats: {
        completed: discoveredUrls.length || 0,
        total: discoveredUrls.length || 0,
        creditsUsed: discoveredUrls.length || 0,
        successfulPages: successfulPages || 0,
        failedPages: failedPages || 0,
        cacheHits: cacheStats.hits,
        cacheMisses: cacheStats.misses,
      },
      investments: cleanedInvestments || [],
      extractionQuality: {
        totalPages: discoveredUrls.length,
        successfulExtractions: successfulPages,
        averageConfidence: avgConfidence,
        incompleteInvestments: incompleteInvestments,
        extractionMethods: {
          ai: aiExtractions.length,
          fallbackMarkdown: fallbackExtractions.length,
          harvested: harvestedExtractions.length,
          aiAvgConfidence: avgAiConfidence,
          fallbackAvgConfidence: avgFallbackConfidence
        }
      },
      metadata: {
        url: url,
        crawlDepth: crawlDepthValue,
        maxPages: maxPagesValue,
        renderJs: renderJs || false,
        extractionMode: "structured",
        timestamp: new Date().toISOString(),
        requestId: rid,
      },
    };

    console.log(`[${rid}] Returning response with ${cleanedInvestments.length} investments (partial: ${isPartial})`);
    console.log(`[${rid}] Cache stats: ${cacheStats.hits} hits, ${cacheStats.misses} misses (${cacheStats.hits + cacheStats.misses > 0 ? Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100) : 0}% hit rate)`);

    // Save to history database in background (don't await)
    if (supabaseUrl && supabaseKey) {
      console.log("Saving scraping history to database...");
      // Fire and forget - save history without blocking response
      fetch(`${supabaseUrl}/rest/v1/scraping_history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          url: url,
          investment_count: cleanedInvestments.length,
          pages_crawled: discoveredUrls.length,
          credits_used: discoveredUrls.length,
          investments_data: cleanedInvestments,
        }),
      })
      .then(res => {
        if (!res.ok) {
          console.error("Failed to save history - status:", res.status);
          return res.text().then(text => console.error("History save error details:", text));
        } else {
          console.log("History saved successfully");
        }
      })
      .catch(err => console.error("Error saving history:", err));
    } else {
      console.warn("Supabase credentials not available, skipping history save");
    }

    return new Response(
      JSON.stringify(responseData),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Critical error during crawl:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack available");
    
    // Always return structured JSON even on error
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
        errorType: error instanceof Error ? error.name : "Unknown",
        stage: "unknown",
        statusCode: 500,
        crawlStats: {
          completed: 0,
          total: 0,
          creditsUsed: 0,
          successfulPages: 0,
          failedPages: 0,
        },
        investments: [],
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
