/**
 * Enhanced Firecrawl extraction schemas with nested structure
 */

export const singleExtractionSchema = {
  type: "object",
  properties: {
    company: {
      type: "object",
      description: "Company information for THIS SPECIFIC PAGE ONLY",
      properties: {
        name: { type: "string", description: "The portfolio company name" },
        industry: { type: "string", description: "Primary industry or sector" },
        location: { type: "string", description: "Headquarters location (City, State/Country)" },
        website: { type: "string", description: "Company website URL" },
        ceo: { type: "string", description: "CEO or company leader name" },
        description: { type: "string", description: "Brief company description" }
      },
      required: ["name"]
    },
    investment: {
      type: "object",
      description: "Investment details for THIS SPECIFIC COMPANY",
      properties: {
        role: { type: "string", description: "The private equity firm's role (e.g., Majority, Growth, Platform)" },
        ownership: { type: "string", description: "Ownership stake or control level" },
        year_of_initial_investment: { type: "string", description: "Year of first investment (YYYY format)" },
        status: { type: "string", description: "Investment status (Active, Exited, etc.)" }
      }
    }
  },
  required: ["company"]
};

export const listingExtractionSchema = {
  type: "object",
  properties: {
    investments: {
      type: "array",
      description: "Array of ALL portfolio companies visible on this page. IMPORTANT: Extract company name even if no other details are visible (e.g., if page only shows logos and names). For image-grid portfolios showing only company names and logos, extract just the names.",
      items: {
        type: "object",
        properties: {
          company: {
            type: "object",
            properties: {
              name: { type: "string", description: "Portfolio company name for THIS SPECIFIC COMPANY ONLY (REQUIRED - extract even if no other data is available)" },
              industry: { type: "string", description: "Industry for THIS SPECIFIC COMPANY ONLY (optional)" },
              location: { type: "string", description: "Headquarters for THIS SPECIFIC COMPANY ONLY (optional)" },
              website: { type: "string", description: "Website for THIS SPECIFIC COMPANY ONLY (optional)" },
              ceo: { type: "string", description: "CEO for THIS SPECIFIC COMPANY ONLY (optional)" },
              description: { type: "string", description: "Description for THIS SPECIFIC COMPANY ONLY (optional)" }
            },
            required: ["name"]
          },
          investment: {
            type: "object",
            properties: {
              role: { type: "string", description: "Investment role for THIS SPECIFIC COMPANY (optional)" },
              ownership: { type: "string", description: "Ownership for THIS SPECIFIC COMPANY (optional)" },
              year_of_initial_investment: { type: "string", description: "Year for THIS SPECIFIC COMPANY (optional)" },
              status: { type: "string", description: "Status for THIS SPECIFIC COMPANY (optional)" }
            }
          }
        },
        required: ["company"]
      }
    }
  },
  required: ["investments"]
};

/**
 * Normalizes extracted data from nested schema format to flat Investment type
 */
export function normalizeExtractedData(extracted: any, pageUrl: string): any {
  if (!extracted) return null;

  // Single company format
  if (extracted.company) {
    return {
      name: extracted.company.name || "",
      industry: extracted.company.industry,
      location: extracted.company.location,
      website: extracted.company.website,
      ceo: extracted.company.ceo,
      description: extracted.company.description,
      investmentRole: extracted.investment?.role,
      ownership: extracted.investment?.ownership,
      year: extracted.investment?.year_of_initial_investment,
      status: extracted.investment?.status,
      sourceUrl: pageUrl,
      portfolioUrl: pageUrl,
    };
  }

  // Listing format
  if (extracted.investments && Array.isArray(extracted.investments)) {
    return extracted.investments.map((item: any) => ({
      name: item.company?.name || "",
      industry: item.company?.industry,
      location: item.company?.location,
      website: item.company?.website,
      ceo: item.company?.ceo,
      description: item.company?.description,
      investmentRole: item.investment?.role,
      ownership: item.investment?.ownership,
      year: item.investment?.year_of_initial_investment,
      status: item.investment?.status,
      sourceUrl: pageUrl,
      portfolioUrl: pageUrl,
    }));
  }

  return null;
}
