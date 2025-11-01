import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, FileSpreadsheet, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { exportInvestments } from "@/utils/dataExport";
import { getSettings } from "@/lib/settings";
import type { Investment } from "@/pages/Index";

interface HistoryEntry {
  id: string;
  url: string;
  investment_count: number;
  pages_crawled: number;
  credits_used: number;
  investments_data: Investment[];
  created_at: string;
}

export const ScrapingHistory = () => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("scraping_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      // Cast investments_data from Json to Investment[]
      const typedData = (data || []).map(entry => ({
        ...entry,
        investments_data: entry.investments_data as unknown as Investment[],
      }));

      setHistory(typedData);
    } catch (error) {
      console.error("Error loading history:", error);
      toast({
        title: "Failed to load history",
        description: "Could not retrieve scraping history",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = (entry: HistoryEntry) => {
    try {
      const settings = getSettings();
      const timestamp = new Date(entry.created_at).toISOString().split('T')[0];
      const filename = `investments_${timestamp}`;
      
      exportInvestments(entry.investments_data, settings.outputFormat, filename);
      
      const formatLabel = settings.outputFormat.toUpperCase();
      toast({
        title: "Export successful!",
        description: `Exported ${entry.investment_count} investments as ${formatLabel}`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export failed",
        description: "Could not export data",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return null;
  }

  if (history.length === 0) {
    return null;
  }

  return (
    <Card className="p-6 shadow-elegant mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Recent Scrapes</h3>
      </div>
      
      <div className="space-y-3">
        {history.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline truncate flex items-center gap-1"
                >
                  {entry.url}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{formatDate(entry.created_at)}</span>
                <span>•</span>
                <Badge variant="secondary" className="text-xs">
                  {entry.investment_count} investments
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {entry.pages_crawled} pages
                </Badge>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleExport(entry)}
              className="ml-4 flex-shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
};
