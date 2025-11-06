/**
 * Investment data deduplication and final processing
 */

import type { Investment } from "./types.ts";

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
    const key = investment.name.toLowerCase().trim();
    
    if (investmentMap.has(key)) {
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
