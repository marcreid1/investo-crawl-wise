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

function cleanInvestment(investment: Investment): Investment {
  return {
    name: cleanInvestmentName(investment.name),
    industry: investment.industry ? cleanText(investment.industry) : undefined,
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
    const isSingleInvestmentPage = pageUrl.includes('/investment') || pageUrl.includes('/portfolio') || pageUrl.includes('/company');
    
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
    const isSingleInvestmentPage = pageUrl.includes('/investment') || pageUrl.includes('/portfolio') || pageUrl.includes('/company');
    
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
    
    const extractionSchema = {
      type: "object",
      properties: {
        company_name: { 
          type: "string", 
          description: "The name of the portfolio company." 
        },
        industry: { 
          type: "string", 
          description: "The primary industry or sector of the company." 
        },
        ceo: { 
          type: "string", 
          description: "The name of the Chief Executive Officer or equivalent company leader." 
        },
        investment_role: { 
          type: "string", 
          description: "The firm's role in the investment (e.g., lead investor, minority partner, strategic investor)." 
        },
        ownership: { 
          type: "string", 
          description: "The ownership stake or percentage held in the company." 
        },
        year_of_initial_investment: { 
          type: "string", 
          description: "The year the firm first invested in the company." 
        },
        location: { 
          type: "string", 
          description: "The headquarters city and province/state of the company." 
        },
        website: { 
          type: "string", 
          description: "The company's official website URL." 
        },
        status: { 
          type: "string", 
          description: "The investment status (e.g., Current, Realized, Exited)." 
        }
      },
      required: ["company_name", "industry", "website"]
    };

    // First, crawl to discover all investment pages
    console.log("Step 1: Discovering investment pages...");
    const crawlRequestBody: any = {
      url: url,
      limit: maxPagesValue,
      maxDepth: crawlDepthValue,
      scrapeOptions: {
        formats: ["markdown"],
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

    const crawlInitData = await crawlInitResponse.json();
    
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
    
    const jobId = crawlInitData.id;
    console.log("Crawl job initiated with ID:", jobId);

    // Poll for crawl completion with reduced timeout budget
    let crawlComplete = false;
    let discoveredUrls: string[] = [];
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
          }
        }
        
        if (crawlData?.status === "completed") {
          crawlComplete = true;
          console.log(`[${rid}] Crawl completed with ${discoveredUrls.length} investment pages`);
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
    let successfulPages = 0;
    let failedPages = 0;

    for (const pageUrl of discoveredUrls) {
      try {
        console.log(`Extracting structured data from: ${pageUrl}`);
        
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
              formats: ["extract"],
              extract: {
                schema: extractionSchema,
              },
            }),
          }
        );

        if (!scrapeResponse.ok) {
          const errorText = await scrapeResponse.text();
          console.error(`HTTP ${scrapeResponse.status} failed to extract from ${pageUrl}:`, errorText);
          failedPages++;
          continue;
        }

        const scrapeData = await scrapeResponse.json();
        
        // Log full response for debugging
        console.log(`Full Firecrawl response for ${pageUrl}:`, JSON.stringify(scrapeData));
        
        // Extract data from the correct Firecrawl v1 response structure
        const extracted = scrapeData?.data?.extract || scrapeData?.extract;

        if (scrapeData?.success && extracted) {
          console.log(`Extracted data:`, JSON.stringify(extracted));
          
          // Map the structured data to our Investment type
          const investment: Investment = {
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

          if (investment.name) {
            allInvestments.push(investment);
            successfulPages++;
            console.log(`Successfully extracted: ${investment.name}`);
          } else {
            console.warn(`Extraction returned empty name for ${pageUrl}`);
            console.warn(`Full extraction data:`, JSON.stringify(extracted));
            failedPages++;
          }
        } else {
          console.warn(`No structured data extracted from ${pageUrl}`);
          console.warn(`Response success: ${scrapeData?.success}, has extract: ${!!extracted}`);
          console.warn(`Available keys: ${Object.keys(scrapeData || {}).join(', ')}`);
          console.warn(`Full response:`, JSON.stringify(scrapeData));
          failedPages++;
        }
      } catch (error) {
        console.error(`Error extracting from ${pageUrl}:`, error);
        failedPages++;
      }
    }

    console.log(`Extraction summary: ${successfulPages} successful, ${failedPages} failed`);

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
      },
      investments: cleanedInvestments || [],
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

    // Save to history database in background (don't await)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
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
