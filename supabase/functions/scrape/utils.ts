/**
 * Text cleaning and normalization utilities
 */

import type { Investment } from "./types.ts";

/**
 * Cleans and normalizes text by removing common page fragments and extra whitespace
 */
export function cleanText(text: string): string {
  if (!text) return "";
  
  return text
    .replace(/Investments\s*[-–—]\s*Page\s*\d+/gi, "")
    .replace(/Role\s*:\s*/gi, "")
    .replace(/Investment\s*:\s*/gi, "")
    .replace(/Portfolio\s*:\s*/gi, "")
    .replace(/Company\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Removes firm name suffixes from investment names
 */
export function cleanInvestmentName(name: string): string {
  if (!name) return "";
  
  return name
    .replace(/\s*[-–—]\s*Ironbridge\s+Equity\s+Partners\s*$/i, "")
    .trim();
}

/**
 * Normalizes industry strings, handling concatenated values
 */
export function normalizeIndustry(industry: string | undefined): string | undefined {
  if (!industry) return undefined;
  
  const commaCount = (industry.match(/,/g) || []).length;
  if (industry.length > 120 || commaCount > 4) {
    const firstSegment = industry.split(',')[0].trim();
    return firstSegment.length > 3 ? firstSegment : undefined;
  }
  
  return industry;
}

/**
 * Normalizes company name (removes common suffixes and trailing descriptions)
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return "";
  
  return name
    .replace(/\s+(Inc\.|LLC|Ltd\.|Corporation|Corp\.|Co\.)$/i, '')
    .replace(/\s+-\s+.+$/i, '') // Remove trailing " - Description"
    .trim();
}

/**
 * Normalizes location field (standardizes state abbreviations)
 */
export function normalizeLocation(location: string | undefined): string | undefined {
  if (!location) return undefined;
  
  const stateAbbreviations: Record<string, string> = {
    'California': 'CA', 'New York': 'NY', 'Texas': 'TX', 'Florida': 'FL',
    'Illinois': 'IL', 'Pennsylvania': 'PA', 'Ohio': 'OH', 'Georgia': 'GA',
    'North Carolina': 'NC', 'Michigan': 'MI', 'New Jersey': 'NJ', 'Virginia': 'VA',
    'Washington': 'WA', 'Arizona': 'AZ', 'Massachusetts': 'MA', 'Tennessee': 'TN',
    'Indiana': 'IN', 'Missouri': 'MO', 'Maryland': 'MD', 'Wisconsin': 'WI',
    'Colorado': 'CO', 'Minnesota': 'MN', 'South Carolina': 'SC', 'Alabama': 'AL',
    'Louisiana': 'LA', 'Kentucky': 'KY', 'Oregon': 'OR', 'Oklahoma': 'OK',
    'Connecticut': 'CT', 'Utah': 'UT', 'Iowa': 'IA', 'Nevada': 'NV',
  };
  
  let normalized = location;
  for (const [full, abbr] of Object.entries(stateAbbreviations)) {
    normalized = normalized.replace(new RegExp(full, 'gi'), abbr);
  }
  
  return normalized.trim();
}

/**
 * Applies all cleaning and normalization functions to an investment object
 */
export function cleanInvestment(investment: Investment): Investment {
  return {
    name: normalizeCompanyName(cleanInvestmentName(cleanText(investment.name))),
    industry: normalizeIndustry(investment.industry ? cleanText(investment.industry) : undefined),
    date: investment.date ? cleanText(investment.date) : undefined,
    year: investment.year ? cleanText(investment.year) : undefined,
    description: investment.description ? cleanText(investment.description) : undefined,
    ceo: investment.ceo ? cleanText(investment.ceo) : undefined,
    investmentRole: investment.investmentRole ? cleanText(investment.investmentRole) : undefined,
    ownership: investment.ownership ? cleanText(investment.ownership) : undefined,
    location: normalizeLocation(investment.location ? cleanText(investment.location) : undefined),
    website: investment.website ? cleanText(investment.website) : undefined,
    status: investment.status ? cleanText(investment.status) : undefined,
    partners: investment.partners?.map(p => cleanText(p)).filter(p => p.length > 0),
    portfolioUrl: investment.portfolioUrl,
    sourceUrl: investment.sourceUrl,
  };
}
