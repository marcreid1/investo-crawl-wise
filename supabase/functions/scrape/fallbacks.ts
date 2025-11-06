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
      /\*\*(?:CEO|President|Chief Executive|Managing Director|President & CEO)\*\*[\s:]*([A-Za-z\s\-'\.]+?)(?:\n|##|<|$)/i,
      /(?:CEO|President|Chief Executive|Managing Director|President & CEO|President and CEO)[\s:]+([A-Za-z\s\-'\.]+?)(?:\n|##|<|$|\*\*)/i,
      /##\s*(?:CEO|Leadership|Management)\s*\n+([A-Za-z\s\-'\.]{3,50})/i,
    ];
    
    for (const pattern of ceoPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1] && match[1].trim().length > 2 && match[1].trim().length < 50) {
        investment.ceo = match[1].trim();
        console.log(`  ✓ Fallback found CEO: ${investment.ceo}`);
        break;
      }
    }
  }
  
  if (!investment.industry) {
    const industryPatterns = [
      /\*\*(?:Industry|Sector|Category|Vertical|Business)\*\*[\s:]*([A-Za-z\s&,\/\.-]{3,50})(?:\n|$|<|##)/i,
      /(?:Industry|Sector|Category|Vertical|Business)[\s:]+([A-Za-z\s&,\/\.-]{3,50})(?:\n|$|<|##|\*\*)/i,
      /##\s*(?:Industry|Sector)\s*\n+([A-Za-z\s&,\/\.-]{3,50})/i,
    ];
    
    for (const pattern of industryPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1]) {
        investment.industry = match[1].trim();
        console.log(`  ✓ Fallback found industry: ${investment.industry}`);
        break;
      }
    }
  }
  
  if (!investment.year) {
    const yearPatterns = [
      /\*\*(?:Year\s+of\s+Initial\s+Investment|Investment\s+Year|Year Acquired|Initial Investment|Year|Date)\*\*[\s:]*(\d{4})/i,
      /(?:Year\s+of\s+Initial\s+Investment|Investment\s+Year|Year Acquired|Initial Investment)[\s:]+(\d{4})/i,
      /(?:Since|In|Acquired in)\s+(\d{4})/i,
      /\b(19\d{2}|20[0-2]\d)\b/,
    ];
    
    for (const pattern of yearPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1]) {
        const year = match[1].trim();
        if (parseInt(year) >= 1990 && parseInt(year) <= 2025) {
          investment.year = year;
          console.log(`  ✓ Fallback found year: ${year}`);
          break;
        }
      }
    }
  }
  
  if (!investment.location) {
    const locationPatterns = [
      /\*\*(?:Location|Headquarters|HQ|Based in|Office)\*\*[\s:]*([A-Za-z\s,\-'\.]+?)(?:\n|$|##)/i,
      /(?:Location|Headquarters|HQ|Based in|Office)[\s:]+([A-Za-z\s,\-'\.]+?)(?:\n|$|##|\*\*)/i,
      /##\s*(?:Location|Headquarters)\s*\n+([A-Za-z\s,\-'\.]{3,50})/i,
    ];
    
    for (const pattern of locationPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1] && match[1].trim().length > 2) {
        investment.location = match[1].trim();
        console.log(`  ✓ Fallback found location: ${investment.location}`);
        break;
      }
    }
  }
  
  if (!investment.website) {
    const websitePatterns = [
      /\*\*(?:Website|Web|URL)\*\*[\s:]*<?([a-z]+:\/\/(?!.*ironbridge)[^\s<>\n]+)>?/i,
      /(?:Website|Web|URL)[\s:]+<?([a-z]+:\/\/(?!.*ironbridge)[^\s<>\n]+)>?/i,
      /\[(?:Visit Website|Website|Company Site)\]\(([^)]+)\)/i,
      /(https?:\/\/(?!.*ironbridge)[^\s<>\n)]+\.[a-z]{2,})/i,
    ];
    
    for (const pattern of websitePatterns) {
      const match = markdown.match(pattern);
      if (match && match[1] && !match[1].includes('ironbridge')) {
        investment.website = match[1].trim();
        console.log(`  ✓ Fallback found website: ${investment.website}`);
        break;
      }
    }
  }
  
  if (!investment.status) {
    const statusPatterns = [
      /\[([^\]]+)\]\([^)]*portfolio_cat\/(current|exited)[^)]*\)/i,
      /(?:category|portfolio)[:\s]*(current|exited|active|realized)/i,
      /\*\*(?:Status|Investment Status|Category)\*\*[\s:]*\*?\*?(Active|Current|Exited|Realized|Portfolio Company)\*?\*?/i,
      /(?:Status|Investment Status|Category)[\s:]+\*?\*?(Active|Current|Exited|Realized|Portfolio Company)\*?\*?/i,
      /(current|exited|active|realized)\s+portfolio/i,
    ];
    
    for (const pattern of statusPatterns) {
      const match = markdown.match(pattern);
      if (match) {
        const statusValue = (match[1] || match[2])?.trim().toLowerCase();
        if (statusValue && (statusValue.includes('current') || statusValue.includes('active'))) {
          console.log(`  ✓ Fallback found status: Current`);
          investment.status = 'Current';
          break;
        } else if (statusValue && (statusValue.includes('exited') || statusValue.includes('realized'))) {
          console.log(`  ✓ Fallback found status: Exited`);
          investment.status = 'Exited';
          break;
        }
      }
    }
  }
  
  // Default to "Current" for recent investments (2020+)
  if (!investment.status && investment.year) {
    const year = parseInt(investment.year);
    if (year >= 2020) {
      console.log(`  ✓ Fallback defaulted status to Current (recent investment)`);
      investment.status = 'Current';
    }
  }
  
  // Add ownership extraction with qualitative and quantitative patterns
  if (!investment.ownership) {
    const ownershipPatterns = [
      /\*\*(?:Ownership|Equity|Stake)\*\*[\s:]*(\d+(?:\.\d+)?%)/i,
      /(?:Ownership|Equity|Stake)[\s:]+(\d+(?:\.\d+)?%)/i,
      /(\d+(?:\.\d+)?%)\s*(?:ownership|equity|stake)/i,
      /(majority|minority|controlling|significant|partial)\s+(?:stake|ownership|interest|investment)/i,
      /(?:acquired|owns|holds)\s+(\d+(?:\.\d+)?%)/i,
    ];
    
    for (const pattern of ownershipPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1]) {
        investment.ownership = match[1].trim();
        console.log(`  ✓ Fallback found ownership: ${investment.ownership}`);
        break;
      }
    }
  }
  
  // Infer ownership from investment role if still not found
  if (!investment.ownership && investment.investmentRole) {
    const role = investment.investmentRole.toLowerCase();
    if (role.includes('lead') || role.includes('control') || role.includes('majority')) {
      console.log(`  ✓ Fallback inferred ownership from role: Majority stake`);
      investment.ownership = 'Majority stake';
    } else if (role.includes('minority') || role.includes('co-investor')) {
      console.log(`  ✓ Fallback inferred ownership from role: Minority stake`);
      investment.ownership = 'Minority stake';
    }
  }
  
  // Add investment role extraction
  if (!investment.investmentRole) {
    const rolePatterns = [
      /\*\*(?:Investment Role|Role|Type|Strategy)\*\*[\s:]*([A-Za-z\s,\-]{3,50})(?:\n|$|##)/i,
      /(?:Investment Role|Investment Type|Role|Type)[\s:]+([A-Za-z\s,\-]{3,50})(?:\n|$|##|\*\*)/i,
    ];
    
    for (const pattern of rolePatterns) {
      const match = markdown.match(pattern);
      if (match && match[1]) {
        investment.investmentRole = match[1].trim();
        console.log(`  ✓ Fallback found investment role: ${investment.investmentRole}`);
        break;
      }
    }
  }
  
  return investment;
}
