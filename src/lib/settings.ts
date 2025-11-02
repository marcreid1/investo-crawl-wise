// Settings management utilities
export type OutputFormat = "excel" | "csv" | "json";

export interface ScraperSettings {
  outputFormat: OutputFormat;
  crawlDepth: number;
  enableCompanyTags: boolean;
  renderJs: boolean;
  maxPages: number;
}

const SETTINGS_KEY = "investment_scraper_settings";

const DEFAULT_SETTINGS: ScraperSettings = {
  outputFormat: "excel",
  crawlDepth: 2,
  enableCompanyTags: false,
  renderJs: false,
  maxPages: 50,
};

export const getSettings = (): ScraperSettings => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
  return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: ScraperSettings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Error saving settings:", error);
  }
};

export const resetSettings = (): void => {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch (error) {
    console.error("Error resetting settings:", error);
  }
};
