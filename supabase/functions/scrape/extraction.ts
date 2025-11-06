/**
 * AI-powered and fallback extraction logic for investment data
 */

import type { CrawlData, Investment } from "./types.ts";
import { cleanInvestmentName } from "./utils.ts";
import { isDetailPage } from "./discovery.ts";

/**
 * Extracts investment data from HTML using CSS selectors and patterns
 */
export function extractInvestmentDataFromHTML(page: CrawlData): Investment[] {
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
    
    const isSingleInvestmentPage = isDetailPage(pageUrl);
    
    if (isSingleInvestmentPage && pageUrl) {
      console.log(`Detected single investment page, extracting from full content`);
      
      // Extract company name from URL slug (primary source)
      let urlDerivedName = '';
      const urlParts = pageUrl.split('/').filter(p => p.length > 0);
      if (urlParts.length > 0) {
        const slug = urlParts[urlParts.length - 1];
        urlDerivedName = slug
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
      
      console.log(`[EXTRACTION] URL: ${pageUrl}`);
      console.log(`[EXTRACTION] URL-derived name: ${urlDerivedName}`);
      console.log(`[EXTRACTION] Page title: ${pageTitle}`);
      
      const investment: Investment = {
        name: urlDerivedName || cleanInvestmentName(pageTitle),
        sourceUrl: pageUrl,
        portfolioUrl: pageUrl,
      };
      
      const htmlText = page.html;
      
      // Try to extract company name from h1 tag (override URL-derived name if found)
      const h1Pattern = /<h1[^>]*>([^<]+)<\/h1>/i;
      const h1Match = htmlText.match(h1Pattern);
      if (h1Match && h1Match[1] && h1Match[1].trim()) {
        const h1Name = cleanInvestmentName(h1Match[1].trim());
        if (h1Name && h1Name.toLowerCase() !== 'investments' && h1Name.toLowerCase() !== 'portfolio') {
          investment.name = h1Name;
          console.log(`[EXTRACTION] H1-derived name: ${h1Name}`);
        }
      }
      
      console.log(`[EXTRACTION] Final name: ${investment.name}`);
      
      // Extract industry with more flexible patterns
      const industryPatterns = [
        /<(?:div|span|p|td|dd)[^>]*(?:class|id)="[^"]*(?:industry|sector|category|vertical)[^"]*"[^>]*>([^<]+)</i,
        /(?:Industry|Sector|Category|Vertical|Business)[\s:]*<[^>]*>([^<]+)/i,
        /(?:Industry|Sector|Category|Vertical|Business)[\s:]+([A-Za-z\s&,\/\.-]{3,50})(?:\n|<|$)/i,
      ];
      
      for (const pattern of industryPatterns) {
        const match = htmlText.match(pattern);
        if (match && match[1]) {
          investment.industry = match[1].trim();
          console.log(`  ✓ Industry found: ${investment.industry}`);
          break;
        }
      }
      
      // Extract year/date with multiple patterns
      const yearPatterns = [
        /(?:Date|Year|Investment Date|Acquired|Initial Investment|Since)[\s:]*<[^>]*>(\d{4})/i,
        /(?:Date|Year|Investment Date|Acquired|Initial Investment|Since)[\s:]+(\d{4})/i,
        /\b(19\d{2}|20[0-2]\d)\b/,
      ];
      
      for (const pattern of yearPatterns) {
        const match = htmlText.match(pattern);
        if (match && match[1]) {
          const year = match[1].trim();
          if (parseInt(year) >= 1990 && parseInt(year) <= 2025) {
            investment.date = year;
            investment.year = year;
            console.log(`  ✓ Year found: ${year}`);
            break;
          }
        }
      }
      
      // Extract CEO
      const ceoPatterns = [
        /(?:CEO|President|Chief Executive|Managing Director|President & CEO)[\s:]*<[^>]*>([^<]{3,50})</i,
        /(?:CEO|President|Chief Executive|Managing Director)[\s:]+([A-Za-z\s\-'\.]{3,50})(?:\n|<|$)/i,
      ];
      
      for (const pattern of ceoPatterns) {
        const match = htmlText.match(pattern);
        if (match && match[1]) {
          investment.ceo = match[1].trim();
          console.log(`  ✓ CEO found: ${investment.ceo}`);
          break;
        }
      }
      
      // Extract website URL
      const websitePatterns = [
        /<a[^>]+href="(https?:\/\/(?!.*ironbridge)[^"]+)"[^>]*>(?:Website|Visit|Company Site)/i,
        /(?:Website|URL|Web)[\s:]*<a[^>]+href="([^"]+)"/i,
        /href="(https?:\/\/(?!.*ironbridge)[^"]+)"[^>]*target="_blank"/i,
      ];
      
      for (const pattern of websitePatterns) {
        const match = htmlText.match(pattern);
        if (match && match[1] && !match[1].includes('ironbridge')) {
          investment.website = match[1].trim();
          console.log(`  ✓ Website found: ${investment.website}`);
          break;
        }
      }
      
      // Extract location
      const locationPatterns = [
        /(?:Location|Headquarters|HQ|Based in|Office)[\s:]*<[^>]*>([^<]{3,50})</i,
        /(?:Location|Headquarters|HQ|Based in)[\s:]+([A-Za-z\s,\-'\.]{3,50})(?:\n|<|$)/i,
      ];
      
      for (const pattern of locationPatterns) {
        const match = htmlText.match(pattern);
        if (match && match[1]) {
          investment.location = match[1].trim();
          console.log(`  ✓ Location found: ${investment.location}`);
          break;
        }
      }
      
      // Extract ownership - with qualitative and quantitative patterns
      const ownershipPatterns = [
        /(?:Ownership|Equity|Stake)[\s:]*<[^>]*>(\d+(?:\.\d+)?%)/i,
        /(?:Ownership|Equity|Stake)[\s:]+(\d+(?:\.\d+)?%)/i,
        /(\d+(?:\.\d+)?%)\s*(?:ownership|equity|stake)/i,
        /(majority|minority|controlling|significant|partial)\s+(?:stake|ownership|interest|investment)/i,
        /(?:acquired|owns|holds)\s+(\d+(?:\.\d+)?%)/i,
      ];
      
      for (const pattern of ownershipPatterns) {
        const match = htmlText.match(pattern);
        if (match && match[1]) {
          investment.ownership = match[1].trim();
          console.log(`  ✓ Ownership found: ${investment.ownership}`);
          break;
        }
      }
      
      // Extract investment role/type
      const rolePatterns = [
        /(?:Investment Role|Role|Type|Strategy)[\s:]*<[^>]*>([^<]{3,50})</i,
        /(?:Investment Role|Investment Type|Role|Type)[\s:]+([A-Za-z\s,\-]{3,50})(?:\n|<|$)/i,
      ];
      
      for (const pattern of rolePatterns) {
        const match = htmlText.match(pattern);
        if (match && match[1]) {
          investment.investmentRole = match[1].trim();
          console.log(`  ✓ Investment role found: ${investment.investmentRole}`);
          break;
        }
      }
      
      // Extract status - check category links and taxonomy
      const statusPatterns = [
        /<a[^>]*href="[^"]*portfolio_cat\/(current|exited)[^"]*"[^>]*>([^<]+)<\/a>/i,
        /category[^>]*>?\s*(current|exited|active|realized)/i,
        /(?:Portfolio|Category)[\s:]*(?:<[^>]*>)?(Current|Exited|Active|Realized)/i,
        /(?:Status|Investment Status)[\s:]*<[^>]*>(Active|Current|Exited|Realized|Portfolio Company)</i,
        /(?:Status|Investment Status)[\s:]+(Active|Current|Exited|Realized|Portfolio Company)/i,
        /<span[^>]*class="[^"]*(?:status|category)[^"]*"[^>]*>([^<]+)<\/span>/i,
      ];
      
      for (const pattern of statusPatterns) {
        const match = htmlText.match(pattern);
        if (match) {
          const statusValue = (match[1] || match[2])?.trim().toLowerCase();
          if (statusValue && (statusValue.includes('current') || statusValue.includes('active'))) {
            console.log(`  ✓ Status found: Current`);
            investment.status = 'Current';
            break;
          } else if (statusValue && (statusValue.includes('exited') || statusValue.includes('realized'))) {
            console.log(`  ✓ Status found: Exited`);
            investment.status = 'Exited';
            break;
          } else if (statusValue) {
            console.log(`  ✓ Status found: ${statusValue}`);
            investment.status = statusValue;
            break;
          }
        }
      }
      
      if (pageDescription) {
        investment.description = pageDescription;
      } else {
        const descMatches = htmlText.match(/<(?:div|p)[^>]*(?:class|id)="[^"]*(?:description|about|overview|content)[^"]*"[^>]*>([^<]{50,500})</i);
        if (descMatches) {
          investment.description = descMatches[1].trim();
          console.log(`Found description from HTML`);
        }
      }
      
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

              // If no name found, try extracting from <a> tags
              if (!investment.name) {
                const linkPattern = /<a[^>]*>([^<]+)<\/a>/i;
                const linkMatch = rowHtml.match(linkPattern);
                if (linkMatch && linkMatch[1]?.trim()) {
                  investment.name = linkMatch[1].trim();
                }
              }

              // If still no name, try image alt text
              if (!investment.name) {
                const altPattern = /<img[^>]*alt="([^"]+)"[^>]*>/i;
                const altMatch = rowHtml.match(altPattern);
                if (altMatch && altMatch[1]) {
                  investment.name = altMatch[1].replace(/\s*(logo|company|brand)\s*/gi, '').trim();
                }
              }

              // Extract the FULL detail page URL for this company from the card
              const urlPattern = /<a[^>]*href="([^"]+)"[^>]*>/i;
              const urlMatch = rowHtml.match(urlPattern);
              if (urlMatch && urlMatch[1]) {
                try {
                  // Make sure we capture the FULL URL, not just the base path
                  const companyUrl = new URL(urlMatch[1], pageUrl).href;
                  investment.portfolioUrl = companyUrl;
                  console.log(`  ✓ Captured detail URL: ${companyUrl}`);
                  
                  // If we still don't have a name, derive it from the URL slug
                  if (!investment.name) {
                    const slug = companyUrl.split('/').filter(p => p).pop() || '';
                    investment.name = slug.split('-').map(w => 
                      w.charAt(0).toUpperCase() + w.slice(1)
                    ).join(' ');
                  }
                } catch (urlError) {
                  // Invalid URL, skip
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

              // Don't overwrite the portfolioUrl if we already captured it from the card link
              if (!investment.portfolioUrl) {
                investment.portfolioUrl = pageUrl;
              }

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

/**
 * Extracts investment data from text/markdown (fallback method)
 */
export function extractInvestmentDataFromText(page: CrawlData): Investment[] {
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
    
    const isSingleInvestmentPage = isDetailPage(pageUrl);
    
    if (isSingleInvestmentPage && pageUrl) {
      console.log(`Single investment page detected, extracting full details`);
      
      // Extract company name from URL slug (primary source)
      let urlDerivedName = '';
      const urlParts = pageUrl.split('/').filter(p => p.length > 0);
      if (urlParts.length > 0) {
        const slug = urlParts[urlParts.length - 1];
        urlDerivedName = slug
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
      
      console.log(`[EXTRACTION] URL: ${pageUrl}`);
      console.log(`[EXTRACTION] URL-derived name: ${urlDerivedName}`);
      console.log(`[EXTRACTION] Page title: ${pageTitle}`);
      
      const investment: Investment = {
        name: urlDerivedName || cleanInvestmentName(pageTitle),
        sourceUrl: pageUrl,
        portfolioUrl: pageUrl,
      };
      
      console.log(`[EXTRACTION] Final name: ${investment.name}`);
      
      // Extract industry with multiple flexible patterns
      const industryPatterns = [
        /\*\*(?:Industry|Sector|Category|Vertical|Business)\*\*[\s:]*([A-Za-z\s&,\/\.-]{3,50})(?:\n|$)/i,
        /(?:Industry|Sector|Category|Vertical|Business)[\s:]+([A-Za-z\s&,\/\.-]{3,50})(?:\n|$|<)/i,
        /##\s*(?:Industry|Sector|Category)\s*\n+([A-Za-z\s&,\/\.-]{3,50})/i,
      ];
      
      for (const pattern of industryPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.industry = match[1].trim();
          console.log(`  ✓ Industry found: ${investment.industry}`);
          break;
        }
      }
      
      // Extract year with more flexible patterns
      const datePatterns = [
        /\*\*(?:Date|Year|Investment Date|Acquired|Initial Investment|Since)\*\*[\s:]*(\d{4})/i,
        /(?:Date|Year|Investment Date|Acquired|Initial Investment|Since)[\s:]+(\d{4})/i,
        /##\s*(?:Year|Date|Investment Year)\s*\n+(\d{4})/i,
        /\b(19\d{2}|20[0-2]\d)\b/,
      ];
      
      for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const year = match[1].trim();
          if (parseInt(year) >= 1990 && parseInt(year) <= 2025) {
            investment.date = year;
            investment.year = year;
            console.log(`  ✓ Year found: ${year}`);
            break;
          }
        }
      }
      
      // Extract CEO
      const ceoPatterns = [
        /\*\*(?:CEO|President|Chief Executive|Managing Director|President & CEO)\*\*[\s:]*([A-Za-z\s\-'\.]{3,50})(?:\n|$)/i,
        /(?:CEO|President|Chief Executive|Managing Director)[\s:]+([A-Za-z\s\-'\.]{3,50})(?:\n|$)/i,
      ];
      
      for (const pattern of ceoPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.ceo = match[1].trim();
          console.log(`  ✓ CEO found: ${investment.ceo}`);
          break;
        }
      }
      
      // Extract website
      const websitePatterns = [
        /\*\*(?:Website|URL|Web)\*\*[\s:]*<?([a-z]+:\/\/(?!.*ironbridge)[^\s<>\n]+)>?/i,
        /(?:Website|URL|Web)[\s:]+<?([a-z]+:\/\/(?!.*ironbridge)[^\s<>\n]+)>?/i,
        /\[(?:Visit Website|Website|Company Site)\]\(([^)]+)\)/i,
        /(https?:\/\/(?!.*ironbridge)[^\s<>\n)]+\.[a-z]{2,})/i,
      ];
      
      for (const pattern of websitePatterns) {
        const match = text.match(pattern);
        if (match && match[1] && !match[1].includes('ironbridge')) {
          investment.website = match[1].trim();
          console.log(`  ✓ Website found: ${investment.website}`);
          break;
        }
      }
      
      // Extract location
      const locationPatterns = [
        /\*\*(?:Location|Headquarters|HQ|Based in|Office)\*\*[\s:]*([A-Za-z\s,\-'\.]{3,50})(?:\n|$)/i,
        /(?:Location|Headquarters|HQ|Based in|Office)[\s:]+([A-Za-z\s,\-'\.]{3,50})(?:\n|$)/i,
      ];
      
      for (const pattern of locationPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.location = match[1].trim();
          console.log(`  ✓ Location found: ${investment.location}`);
          break;
        }
      }
      
      // Extract ownership - with qualitative and quantitative patterns
      const ownershipPatterns = [
        /\*\*(?:Ownership|Equity|Stake)\*\*[\s:]*(\d+(?:\.\d+)?%)/i,
        /(?:Ownership|Equity|Stake)[\s:]+(\d+(?:\.\d+)?%)/i,
        /(\d+(?:\.\d+)?%)\s*(?:ownership|equity|stake)/i,
        /(majority|minority|controlling|significant|partial)\s+(?:stake|ownership|interest|investment)/i,
        /(?:acquired|owns|holds)\s+(\d+(?:\.\d+)?%)/i,
      ];
      
      for (const pattern of ownershipPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.ownership = match[1].trim();
          console.log(`  ✓ Ownership found: ${investment.ownership}`);
          break;
        }
      }
      
      // Extract investment role
      const rolePatterns = [
        /\*\*(?:Investment Role|Role|Type|Strategy)\*\*[\s:]*([A-Za-z\s,\-]{3,50})(?:\n|$)/i,
        /(?:Investment Role|Investment Type|Role|Type)[\s:]+([A-Za-z\s,\-]{3,50})(?:\n|$)/i,
      ];
      
      for (const pattern of rolePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          investment.investmentRole = match[1].trim();
          console.log(`  ✓ Investment role found: ${investment.investmentRole}`);
          break;
        }
      }
      
      // Extract status - check for category mentions and markdown links
      const statusPatterns = [
        /\[([^\]]+)\]\([^)]*portfolio_cat\/(current|exited)[^)]*\)/i,
        /\*\*(?:Status|Investment Status|Category)\*\*[\s:]*\*?\*?(Active|Current|Exited|Realized|Portfolio Company)\*?\*?/i,
        /(?:Status|Investment Status|Category)[\s:]+\*?\*?(Active|Current|Exited|Realized|Portfolio Company)\*?\*?/i,
        /(?:Portfolio|Category)[\s:]+\*\*(Current|Exited|Active|Realized)\*\*/i,
        /(Current|Exited|Active|Realized)\s+(?:Portfolio|Investment)/i,
      ];
      
      for (const pattern of statusPatterns) {
        const match = text.match(pattern);
        if (match) {
          const statusValue = (match[1] || match[2])?.trim().toLowerCase();
          if (statusValue && (statusValue.includes('current') || statusValue.includes('active'))) {
            console.log(`  ✓ Status found: Current`);
            investment.status = 'Current';
            break;
          } else if (statusValue && (statusValue.includes('exited') || statusValue.includes('realized'))) {
            console.log(`  ✓ Status found: Exited`);
            investment.status = 'Exited';
            break;
          } else if (statusValue) {
            console.log(`  ✓ Status found: ${statusValue}`);
            investment.status = statusValue;
            break;
          }
        }
      }
      
      if (pageDescription) {
        investment.description = pageDescription;
      } else {
        const descMatches = text.match(/^([^#\n]{100,500})/m);
        if (descMatches && descMatches[1]) {
          investment.description = descMatches[1].trim();
          console.log(`Found description from text`);
        }
      }
      
      investments.push(investment);
      console.log(`Extracted single investment from text: ${investment.name}`);
      return investments;
    }

    // Patterns that indicate this is NOT a company name
    const NON_COMPANY_PATTERNS = [
      /\b(we want|contact us|learn more|about us|our team|get in touch|click here)\b/i,
      /\b(view all|see all|read more|find out|discover|explore)\b/i,
      /\b(portfolio|investment|company|companies|business|businesses)\b$/i,
      /^(the|our|your|their)\s/i,
      /\?$/,
      /\b(page|section|category|menu|navigation)\b/i,
    ];

    const hasProperCapitalization = (name: string): boolean => {
      const words = name.split(/\s+/);
      const capitalizedWords = words.filter(w => /^[A-Z]/.test(w));
      return capitalizedWords.length / words.length >= 0.5;
    };

    const headingPatterns = [
      /##\s+([A-Z][A-Za-z\s&.-]{2,80})(?:\s*\n)/g,
      /\*\*([A-Z][A-Za-z\s&.-]{2,80})\*\*/g,
      /^([A-Z][A-Za-z\s&.-]{2,80})$/gm,
    ];

    const names = new Set<string>();
    for (const pattern of headingPatterns) {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        const name = match[1].trim();
        
        // Basic length check
        if (name.length < 3 || name.length > 80) return;
        
        // Check against blacklist patterns
        const isBlacklisted = NON_COMPANY_PATTERNS.some(pattern => pattern.test(name));
        if (isBlacklisted) {
          console.log(`  ✗ Filtered out non-company text: "${name}"`);
          return;
        }
        
        // Word count check (company names are typically 1-5 words)
        const words = name.split(/\s+/);
        if (words.length > 5) {
          console.log(`  ✗ Filtered out (too many words): "${name}"`);
          return;
        }
        
        // Capitalization check
        if (!hasProperCapitalization(name)) {
          console.log(`  ✗ Filtered out (poor capitalization): "${name}"`);
          return;
        }
        
        // Passed all filters
        names.add(name);
      });
      if (names.size > 2) break;
    }

    console.log(`Found ${names.size} potential investment names`);

    names.forEach((investmentName, index) => {
      try {
        const investment: Investment = {
          name: investmentName,
          sourceUrl: pageUrl,
          portfolioUrl: pageUrl,
        };

        const nameIndex = text.indexOf(investmentName);
        if (nameIndex >= 0) {
          const contextStart = Math.max(0, nameIndex - 100);
          const contextEnd = Math.min(text.length, nameIndex + 500);
          const context = text.substring(contextStart, contextEnd);
          
          const industryMatch = context.match(/(?:Industry|Sector|Category)[\s:]+([A-Za-z\s&,\/.-]{3,40})/i);
          if (industryMatch && industryMatch[1]) {
            investment.industry = industryMatch[1].trim();
          }
          
          const dateMatch = context.match(/(?:Date|Year|Since|In)[\s:]+([A-Za-z]+\s+\d{4}|\d{4})/i);
          if (dateMatch && dateMatch[1]) {
            investment.date = dateMatch[1].trim();
          }
          
          const descMatch = context.match(/([A-Z][^\.!?]{50,300}[\.!?])/);
          if (descMatch && descMatch[1]) {
            investment.description = descMatch[1].trim();
          }
        }

        if (!investment.description && pageDescription) {
          investment.description = pageDescription;
        }

        investments.push(investment);
        console.log(`Created investment ${index + 1}: ${investmentName}`);
      } catch (investmentErr) {
        console.error(`Error processing investment ${index} (${investmentName}):`, investmentErr);
      }
    });

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

/**
 * Detects and extracts company names from image-grid portfolio format
 * Common pattern: ![](logo.png)\n\nCompany Name
 */
export function extractFromImageGrid(markdown: string, pageUrl: string): Investment[] {
  if (!markdown) return [];
  
  const investments: Investment[] = [];
  
  // Pattern 1: Image followed by company name (markdown format)
  // ![](url)\n\nCompany Name
  const imageGridPattern = /!\[[^\]]*\]\([^)]+\)\s*\n\s*([A-Z][A-Za-z0-9\s&,.''\-]+)/g;
  const matches = [...markdown.matchAll(imageGridPattern)];
  
  if (matches.length >= 5) {
    console.log(`Detected image-grid format with ${matches.length} companies`);
    
    matches.forEach(match => {
      const name = match[1].trim().split('\n')[0].trim();
      if (name && name.length > 2 && name.length < 100) {
        investments.push({
          name: cleanInvestmentName(name),
          sourceUrl: pageUrl,
          portfolioUrl: pageUrl,
        });
      }
    });
    
    console.log(`Extracted ${investments.length} company names from image-grid`);
    return investments;
  }
  
  return [];
}

/**
 * Extracts detail page links from listing page markdown
 * Pattern: [Company Name](url) or <a href="url">Company Name</a>
 */
export function extractDetailLinksFromMarkdown(markdown: string, html: string, baseUrl: string): string[] {
  const detailUrls = new Set<string>();
  const base = new URL(baseUrl);
  
  // Pattern 1: Markdown links [Text](url)
  const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  
  while ((match = markdownLinkPattern.exec(markdown)) !== null) {
    const href = match[2];
    const text = match[1];
    
    try {
      let absoluteUrl: string;
      if (href.startsWith('http')) {
        absoluteUrl = href;
      } else if (href.startsWith('/')) {
        absoluteUrl = `${base.origin}${href}`;
      } else {
        continue;
      }
      
      const url = new URL(absoluteUrl);
      const path = url.pathname.toLowerCase();
      
      // Check if it's a detail page URL
      if (url.origin === base.origin && 
          /\/(portfolio|investments?|companies?)\/[^\/\s#?]+\/?$/i.test(path) &&
          text.length > 2 && text.length < 100) {
        detailUrls.add(absoluteUrl.split('#')[0].split('?')[0]);
      }
    } catch (e) {
      // Invalid URL, skip
    }
  }
  
  // Pattern 2: HTML links from HTML content if available
  if (html) {
    const htmlLinkPattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    
    while ((match = htmlLinkPattern.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].trim();
      
      try {
        let absoluteUrl: string;
        if (href.startsWith('http')) {
          absoluteUrl = href;
        } else if (href.startsWith('/')) {
          absoluteUrl = `${base.origin}${href}`;
        } else {
          continue;
        }
        
        const url = new URL(absoluteUrl);
        const path = url.pathname.toLowerCase();
        
        if (url.origin === base.origin && 
            /\/(portfolio|investments?|companies?)\/[^\/\s#?]+\/?$/i.test(path) &&
            text.length > 2 && text.length < 100) {
          detailUrls.add(absoluteUrl.split('#')[0].split('?')[0]);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }
  }
  
  const result = Array.from(detailUrls);
  console.log(`Extracted ${result.length} detail page links from listing`);
  return result;
}

/**
 * Main extraction orchestrator - tries HTML → Text → Image-Grid
 */
export function extractInvestmentData(page: CrawlData): Investment[] {
  try {
    console.log(`Starting extraction for page: ${page.metadata?.url || 'unknown'}`);
    
    const htmlInvestments = extractInvestmentDataFromHTML(page);
    if (htmlInvestments.length > 0) {
      console.log(`Extracted ${htmlInvestments.length} investments using CSS selectors from ${page.metadata?.url || 'unknown'}`);
      return htmlInvestments;
    }

    console.log(`No structured HTML found on ${page.metadata?.url || 'unknown'}, using text extraction`);
    const textInvestments = extractInvestmentDataFromText(page);
    if (textInvestments.length > 0) {
      return textInvestments;
    }
    
    // Try image-grid extraction as last resort
    console.log(`No text patterns found, trying image-grid extraction`);
    const markdown = page.markdown || "";
    const imageGridInvestments = extractFromImageGrid(markdown, page.metadata?.url || "");
    if (imageGridInvestments.length > 0) {
      console.log(`Extracted ${imageGridInvestments.length} investments from image-grid format`);
      return imageGridInvestments;
    }
    
    return [];
  } catch (error) {
    console.error(`Critical error in extractInvestmentData for ${page.metadata?.url || 'unknown'}:`, error);
    return [];
  }
}
