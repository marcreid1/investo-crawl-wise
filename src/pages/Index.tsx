import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Database, FileSpreadsheet, AlertCircle, Settings as SettingsIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { InvestmentTable } from "@/components/InvestmentTable";
import { ScrapingHistory } from "@/components/ScrapingHistory";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { exportInvestments } from "@/utils/dataExport";
import { getSettings } from "@/lib/settings";

export interface Investment {
  name: string;
  industry?: string;
  ceo?: string;
  investmentRole?: string;
  ownership?: string;
  year?: string;
  location?: string;
  website?: string;
  status?: string;
  date?: string;
  description?: string;
  partners?: string[];
  portfolioUrl?: string;
  sourceUrl: string;
}

interface ScrapeResponse {
  success: boolean;
  partial?: boolean;
  statusCode?: number;
  stage?: string;
  error?: string;
  crawlStats?: {
    completed: number;
    total: number;
    creditsUsed: number;
  };
  investments?: Investment[];
  rawData?: any[];
}

const Index = () => {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [isScraperRunning, setIsScraperRunning] = useState(false);
  const [scrapeData, setScrapeData] = useState<ScrapeResponse | null>(null);
  const { toast } = useToast();

  // Validate URL
  const isValidUrl = (urlString: string): boolean => {
    try {
      const url = new URL(urlString);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleStartScraping = async (quickMode = false) => {
    const trimmedUrl = url.trim();
    
    if (!trimmedUrl) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid portfolio page URL",
        variant: "destructive",
      });
      return;
    }

    if (!isValidUrl(trimmedUrl)) {
      toast({
        title: "Invalid URL format",
        description: "Please enter a complete URL starting with http:// or https://",
        variant: "destructive",
      });
      return;
    }
    
    setIsScraperRunning(true);
    setScrapeData(null);

    try {
      const settings = quickMode 
        ? { crawlDepth: 1, maxPages: 25, renderJs: false, outputFormat: 'excel' as const, enableCompanyTags: false }
        : getSettings();
      
      const requestId = crypto.randomUUID();
      console.log(`Starting scrape with requestId: ${requestId}`);
      
      const { data, error } = await supabase.functions.invoke('scrape', {
        body: { 
          url: trimmedUrl,
          crawlDepth: settings.crawlDepth,
          renderJs: settings.renderJs,
          maxPages: settings.maxPages,
          requestId
        }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        setScrapeData(data);
        
        if (data.partial) {
          toast({
            title: "⚠️ Partial Results",
            description: `Extracted ${data.investments?.length || 0} investments, but scraping timed out. Try lowering crawl depth in Settings.`,
            variant: "destructive",
          });
        } else if (data.investments && data.investments.length > 0) {
          toast({
            title: "✅ Scraping Complete!",
            description: `Extracted ${data.investments.length} investments from ${data.crawlStats?.completed || 0} pages`,
          });
        } else {
          toast({
            title: "No investments found",
            description: "The page was scraped successfully, but no investment data was found. Try a different URL.",
            variant: "destructive",
          });
        }
      } else {
        const errorMsg = data?.error || "Failed to scrape website";
        const statusCode = data?.statusCode;
        const stage = data?.stage;
        
        let description = errorMsg;
        if (statusCode === 401 || statusCode === 403) {
          description = "API authentication failed. Please check your API key configuration.";
        } else if (statusCode === 402) {
          description = "Out of API credits. Please add more credits to continue.";
        } else if (statusCode === 429) {
          description = "Rate limited by API. Please wait and try again later.";
        } else if (statusCode === 408) {
          description = `Scraping timed out at ${stage || 'unknown'} stage. Try reducing Crawl Depth or Max Pages in Settings.`;
        } else if (stage) {
          description = `${errorMsg} (failed at: ${stage})`;
        }
        
        throw new Error(description);
      }
    } catch (error) {
      console.error("Scraping error:", error);
      toast({
        title: "Scraping failed",
        description: error instanceof Error ? error.message : "Failed to scrape website. Please check the URL and try again.",
        variant: "destructive",
      });
    } finally {
      setIsScraperRunning(false);
    }
  };

  const handleTestUrl = () => {
    setUrl("https://ironbridgeequity.com/investments");
    setTimeout(() => handleStartScraping(true), 100);
  };

  const handleExportToExcel = () => {
    if (!scrapeData?.investments || scrapeData.investments.length === 0) {
      toast({
        title: "No data to export",
        description: "Please scrape some investment data first",
        variant: "destructive",
      });
      return;
    }

    try {
      const settings = getSettings();
      const formatLabel = settings.outputFormat.toUpperCase();
      
      exportInvestments(scrapeData.investments, settings.outputFormat);
      
      toast({
        title: "Export successful!",
        description: `Exported ${scrapeData.investments.length} investments as ${formatLabel}`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export data",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-primary shadow-elegant">
                <Database className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Investment Scraper</h1>
                <p className="text-sm text-muted-foreground">Extract investment data from portfolio pages</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/settings")}
              className="gap-2"
            >
              <SettingsIcon className="w-4 h-4" />
              Settings
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* History Section */}
        <ScrapingHistory />

        {/* Input Section */}
        <Card className="p-6 shadow-elegant mb-8">
          <div className="space-y-4">
            <div>
              <label htmlFor="url-input" className="block text-sm font-medium text-foreground mb-2">
                Portfolio Page URL
              </label>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="url-input"
                    type="url"
                    placeholder="https://example.com/investments"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isScraperRunning && url.trim()) {
                        handleStartScraping();
                      }
                    }}
                    className="pl-10"
                    disabled={isScraperRunning}
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={handleTestUrl}
                    disabled={isScraperRunning}
                    className="whitespace-nowrap"
                  >
                    Test Known URL
                  </Button>
                  <Button 
                    onClick={() => handleStartScraping(false)}
                    disabled={!url.trim() || isScraperRunning}
                    className="bg-gradient-primary hover:opacity-90 transition-opacity shadow-elegant"
                  >
                    {isScraperRunning ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                        Scraping...
                      </>
                    ) : (
                      "Start Scraping"
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                Enter the URL of a company's investments or portfolio page. The scraper will automatically crawl linked pages to extract investment data.
              </p>
            </div>
          </div>
        </Card>

        {/* Results Section */}
        <Card className="p-6 shadow-elegant min-h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Results</h2>
              <p className="text-sm text-muted-foreground">
                {scrapeData?.investments 
                  ? `${scrapeData.investments.length} investments found from ${scrapeData.crawlStats?.completed} pages` 
                  : "Extracted investment data will appear here"}
              </p>
            </div>
            {scrapeData?.investments && scrapeData.investments.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportToExcel} className="shadow-sm gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Export Data
              </Button>
            )}
          </div>

          {!scrapeData ? (
            <EmptyState isLoading={isScraperRunning} />
          ) : scrapeData.investments && scrapeData.investments.length > 0 ? (
            <>
              {scrapeData.partial && (
                <div className="mb-4 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-yellow-900 dark:text-yellow-200">Partial Results Returned</p>
                      <p className="text-sm text-yellow-800 dark:text-yellow-300 mt-1">
                        The scrape timed out, but we collected some data. For better results, try lowering Crawl Depth or Max Pages in Settings, or use Quick Mode below.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartScraping(true)}
                        className="mt-3 border-yellow-300 dark:border-yellow-700"
                      >
                        Try Quick Mode
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-gradient-subtle border shadow-sm">
                  <div className="text-2xl font-bold text-primary">{scrapeData.investments.length}</div>
                  <div className="text-sm text-muted-foreground">Investments Found</div>
                </div>
                <div className="p-4 rounded-lg bg-gradient-subtle border shadow-sm">
                  <div className="text-2xl font-bold text-primary">{scrapeData.crawlStats?.completed}</div>
                  <div className="text-sm text-muted-foreground">Pages Crawled</div>
                </div>
                <div className="p-4 rounded-lg bg-gradient-subtle border shadow-sm">
                  <div className="text-2xl font-bold text-primary">{scrapeData.crawlStats?.creditsUsed}</div>
                  <div className="text-sm text-muted-foreground">Credits Used</div>
                </div>
              </div>

              <InvestmentTable investments={scrapeData.investments} />
            </>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">
                No investments found in the scraped pages. Try a different URL or ensure the page contains investment information.
              </p>
              <Button
                variant="outline"
                onClick={() => handleStartScraping(true)}
                disabled={isScraperRunning}
              >
                Try Quick Mode
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default Index;
