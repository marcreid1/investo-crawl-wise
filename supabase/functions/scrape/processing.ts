/**
 * Investment data deduplication and final processing
 */

import type { Investment } from "./types.ts";

/**
 * Helper to normalize names for deduplication (same as matching logic)
 */
function normalizeForDeduplication(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\b\.?/gi, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * Deduplicates investments by name, merging data from duplicate entries
 */
export function deduplicateInvestments(allInvestments: Investment[]): Investment[] {
  const investmentMap = new Map<string, Investment>();
  
  // Validation: Warn about generic names before deduplication
  const genericNames = ['investments', 'portfolio', 'companies', 'investment', 'company'];
  allInvestments.forEach(investment => {
    if (genericNames.includes(investment.name.toLowerCase())) {
      console.warn(`⚠️ Generic name detected: "${investment.name}" from ${investment.sourceUrl}`);
    }
  });

  allInvestments.forEach(investment => {
    const key = normalizeForDeduplication(investment.name);
    
    // Check for exact match OR substring match (to catch "Gesco" vs "Gesco Industries Inc")
    let matchingKey: string | undefined;
    for (const existingKey of investmentMap.keys()) {
      if (existingKey === key || 
          existingKey.includes(key) || 
          key.includes(existingKey)) {
        matchingKey = existingKey;
        break;
      }
    }
    
    if (matchingKey) {
      const existing = investmentMap.get(matchingKey)!;
      
      // Count non-empty fields to determine which entry has more data
      const existingFields = Object.values(existing).filter(v => v).length;
      const newFields = Object.values(investment).filter(v => v).length;
      
      // Prioritize the entry with MORE data
      if (newFields > existingFields) {
        // Keep the new investment but merge in any fields from existing
        const merged = {
          ...existing,
          ...investment,
          name: investment.name, // Use the name with more detail (e.g., "Ltd.")
        };
        investmentMap.delete(matchingKey);
        investmentMap.set(key, merged);
        console.log(`  ✓ Merged duplicate: kept "${investment.name}" (${newFields} fields) over "${existing.name}" (${existingFields} fields)`);
      } else {
        // Keep existing but fill in any missing fields from new
        investmentMap.set(matchingKey, {
          ...investment,
          ...existing,
          name: existing.name,
        });
        console.log(`  ✓ Merged duplicate: kept "${existing.name}" (${existingFields} fields) over "${investment.name}" (${newFields} fields)`);
      }
    } else {
      investmentMap.set(key, investment);
    }
  });

  return Array.from(investmentMap.values());
}
