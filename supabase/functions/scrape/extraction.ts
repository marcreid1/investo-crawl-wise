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
      
      const industryMatches = htmlText.match(/<(?:div|span|p)[^>]*(?:class|id)="[^"]*(?:industry|sector|category|vertical)[^"]*"[^>]*>([^<]+)<|(?:Industry|Sector|Category|Vertical)[\s:]+<[^>]*>([^<]+)</i);
      if (industryMatches) {
        investment.industry = (industryMatches[1] || industryMatches[2] || '').trim();
        console.log(`Found industry: ${investment.industry}`);
      }
      
      const ceoMatches = htmlText.match(/(?:CEO|President|Chief Executive)[\s:]+([A-Za-z\s\-'\.]+?)(?:<|$|\n|##)/i);
      if (ceoMatches) {
        investment.ceo = ceoMatches[1].trim();
        console.log(`Found CEO: ${investment.ceo}`);
      }
      
      const roleMatches = htmlText.match(/(?:Ironbridge\s+Investment\s+Role|Investment\s+Role)[\s:]+([A-Za-z\s]+?)(?:<|$|\n|##)/i);
      if (roleMatches) {
        investment.investmentRole = roleMatches[1].trim();
        console.log(`Found investment role: ${investment.investmentRole}`);
      }
      
      const ownershipMatches = htmlText.match(/(?:Ironbridge\s+Ownership|Ownership)[\s:]+([A-Za-z\s]+?)(?:<|$|\n|##)/i);
      if (ownershipMatches) {
        investment.ownership = ownershipMatches[1].trim();
        console.log(`Found ownership: ${investment.ownership}`);
      }
      
      const dateMatches = htmlText.match(/<(?:div|span|p|time)[^>]*(?:class|id)="[^"]*(?:date|year|invested)[^"]*"[^>]*>([^<]+)<|(?:Date|Year|Invested)[\s:]+<[^>]*>([^<]+)<|(?:Acquired|Investment Date)[\s:]+([0-9]{4}|[A-Za-z]+\s+[0-9]{4})/i);
      if (dateMatches) {
        investment.date = (dateMatches[1] || dateMatches[2] || dateMatches[3] || '').trim();
        console.log(`Found date: ${investment.date}`);
      }
      
      const yearMatches = htmlText.match(/(?:Year\s+of\s+Initial\s+Investment|Investment\s+Year)[\s:]+(\d{4})/i);
      if (yearMatches) {
        investment.year = yearMatches[1].trim();
        console.log(`Found year: ${investment.year}`);
      }
      
      const locationMatches = htmlText.match(/(?:Location|Headquarters|Address)[\s:]+([A-Za-z\s,\-'\.]+?)(?:<|$|\n|##)/i);
      if (locationMatches) {
        investment.location = locationMatches[1].trim();
        console.log(`Found location: ${investment.location}`);
      }
      
      const websiteMatches = htmlText.match(/(?:Website)[\s:]+<?([a-z]+:\/\/[^\s<>\n]+)>?/i);
      if (websiteMatches) {
        investment.website = websiteMatches[1].trim();
        console.log(`Found website: ${investment.website}`);
      }
      
      const statusMatches = htmlText.match(/(?:Status|Investment\s+Status)[\s:]+([A-Za-z\s]+?)(?:<|$|\n|##)/i);
      if (statusMatches) {
        investment.status = statusMatches[1].trim();
        console.log(`Found status: ${investment.status}`);
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
        if (name.length >= 3 && name.length <= 80 && !name.includes('Portfolio') && !name.includes('Investment')) {
          names.add(name);
        }
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
 * Main extraction orchestrator - tries HTML first, falls back to text
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
    return extractInvestmentDataFromText(page);
  } catch (error) {
    console.error(`Critical error in extractInvestmentData for ${page.metadata?.url || 'unknown'}:`, error);
    return [];
  }
}
