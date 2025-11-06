/**
 * Database persistence for scraping history
 */

import type { Investment } from "./types.ts";

/**
 * Saves scraping result to scraping_history table (fire-and-forget)
 */
export async function saveScrapingHistory(
  supabaseUrl: string,
  supabaseKey: string,
  url: string,
  investments: Investment[],
  crawlStats: any
): Promise<void> {
  try {
    console.log("Saving scraping history to database...");
    
    await fetch(`${supabaseUrl}/rest/v1/scraping_history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        url: url,
        pages_crawled: crawlStats.completed || 0,
        investment_count: investments.length,
        credits_used: crawlStats.creditsUsed || 0,
        investments_data: investments || [],
      }),
    }).catch(err => {
      console.error("Failed to save scraping history:", err);
    });
    
    console.log("Scraping history saved successfully");
  } catch (error) {
    console.error("Error saving scraping history:", error);
  }
}
