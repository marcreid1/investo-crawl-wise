/**
 * Fallback extraction and investment validation
 */

import type { Investment, ValidationResult } from "./types.ts";

/**
 * Validates investment completeness and calculates confidence score
 */
export function validateInvestment(investment: Investment): ValidationResult {
  const requiredFields = ['name'];
  const optionalFields = ['industry', 'ceo', 'website', 'year', 'location', 'status', 'investmentRole', 'ownership'];
  
  const missing: string[] = [];
  let filledOptional = 0;
  
  requiredFields.forEach(field => {
    if (!investment[field as keyof Investment]) {
      missing.push(field);
    }
  });
  
  optionalFields.forEach(field => {
    const value = investment[field as keyof Investment];
    if (value && String(value).trim().length > 0) {
      filledOptional++;
    } else {
      missing.push(field);
    }
  });
  
  const confidence = Math.round((filledOptional / optionalFields.length) * 100);
  
  return {
    valid: missing.length === 0,
    confidence,
    missing,
    method: 'ai-extraction'
  };
}

/**
 * Applies fallback extraction using markdown patterns to fill missing fields
 */
export function applyFallbackExtraction(investment: Investment, markdown?: string): Investment {
  if (!markdown) return investment;
  
  console.log(`Applying fallback extraction for: ${investment.name}`);
  
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
