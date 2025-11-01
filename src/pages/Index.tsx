import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Database, FileSpreadsheet } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { InvestmentTable } from "@/components/InvestmentTable";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export interface Investment {
  name: string;
  industry?: string;
  date?: string;
  description?: string;
  partners?: string[];
  portfolioUrl?: string;
  sourceUrl: string;
}

interface ScrapeResponse {
  success: boolean;
  crawlStats?: {
    completed: number;
    total: number;
    creditsUsed: number;
  };
  investments?: Investment[];
  rawData?: any[];
}

const Index = () => {
  const [url, setUrl] = useState("");
  const [isScraperRunning, setIsScraperRunning] = useState(false);
  const [scrapeData, setScrapeData] = useState<ScrapeResponse | null>(null);
  const { toast } = useToast();

  const handleStartScraping = async () => {
    if (!url.trim()) return;
    
    setIsScraperRunning(true);
    setScrapeData(null);

    try {
      const { data, error } = await supabase.functions.invoke('scrape', {
        body: { url: url.trim() }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        setScrapeData(data);
        toast({
          title: "Success!",
          description: `Extracted ${data.investments?.length || 0} investments from ${data.crawlStats?.completed || 0} pages`,
        });
      } else {
        throw new Error(data?.error || "Failed to scrape website");
      }
    } catch (error) {
      console.error("Scraping error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to scrape website",
        variant: "destructive",
      });
    } finally {
      setIsScraperRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-primary">
              <Database className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Investment Scraper</h1>
              <p className="text-sm text-muted-foreground">Extract investment data from portfolio pages</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
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
                    className="pl-10"
                    disabled={isScraperRunning}
                  />
                </div>
                <Button 
                  onClick={handleStartScraping}
                  disabled={!url.trim() || isScraperRunning}
                  className="bg-gradient-primary hover:opacity-90 transition-opacity"
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
            <p className="text-sm text-muted-foreground">
              Enter the URL of a company's investments or portfolio page to extract investment data.
            </p>
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
              <Button variant="outline" size="sm">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export to Excel
              </Button>
            )}
          </div>

          {!scrapeData ? (
            <EmptyState isLoading={isScraperRunning} />
          ) : scrapeData.investments && scrapeData.investments.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-muted">
                  <div className="text-2xl font-bold text-primary">{scrapeData.investments.length}</div>
                  <div className="text-sm text-muted-foreground">Investments Found</div>
                </div>
                <div className="p-4 rounded-lg bg-muted">
                  <div className="text-2xl font-bold text-primary">{scrapeData.crawlStats?.completed}</div>
                  <div className="text-sm text-muted-foreground">Pages Crawled</div>
                </div>
                <div className="p-4 rounded-lg bg-muted">
                  <div className="text-2xl font-bold text-primary">{scrapeData.crawlStats?.creditsUsed}</div>
                  <div className="text-sm text-muted-foreground">Credits Used</div>
                </div>
              </div>

              <InvestmentTable investments={scrapeData.investments} />
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No investments found in the scraped pages. Try a different URL or ensure the page contains investment information.
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default Index;
