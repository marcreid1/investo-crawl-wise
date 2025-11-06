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
 * Applies all cleaning functions to an investment object
 */
export function cleanInvestment(investment: Investment): Investment {
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
