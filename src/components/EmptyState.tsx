import { Database, Search } from "lucide-react";

interface EmptyStateProps {
  isLoading?: boolean;
}

export const EmptyState = ({ isLoading = false }: EmptyStateProps) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-muted border-t-primary" />
          <Search className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-primary" />
        </div>
        <h3 className="mt-6 text-lg font-medium text-foreground">Scraping in progress...</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Analyzing the portfolio page and extracting investment data
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-6 mb-4">
        <Database className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">No data yet</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Enter a portfolio page URL above and click "Start Scraping" to extract investment information.
      </p>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
        <div className="p-4 rounded-lg bg-card border">
          <div className="text-2xl font-bold text-primary mb-1">1</div>
          <p className="text-xs text-muted-foreground">Enter URL</p>
        </div>
        <div className="p-4 rounded-lg bg-card border">
          <div className="text-2xl font-bold text-primary mb-1">2</div>
          <p className="text-xs text-muted-foreground">Scrape Data</p>
        </div>
        <div className="p-4 rounded-lg bg-card border">
          <div className="text-2xl font-bold text-primary mb-1">3</div>
          <p className="text-xs text-muted-foreground">Export to Excel</p>
        </div>
      </div>
    </div>
  );
};
