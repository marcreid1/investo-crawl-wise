import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings as SettingsIcon, ArrowLeft, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSettings, saveSettings, resetSettings, type OutputFormat } from "@/lib/settings";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("excel");
  const [crawlDepth, setCrawlDepth] = useState<number>(3);
  const [enableCompanyTags, setEnableCompanyTags] = useState(false);
  const [renderJs, setRenderJs] = useState(true);
  const [maxPages, setMaxPages] = useState<number>(100);

  useEffect(() => {
    const settings = getSettings();
    setOutputFormat(settings.outputFormat);
    setCrawlDepth(settings.crawlDepth);
    setEnableCompanyTags(settings.enableCompanyTags);
    setRenderJs(settings.renderJs);
    setMaxPages(settings.maxPages);
  }, []);

  const handleSave = () => {
    saveSettings({
      outputFormat,
      crawlDepth,
      enableCompanyTags,
      renderJs,
      maxPages,
    });
    toast({
      title: "Settings saved!",
      description: "Your preferences have been updated successfully.",
    });
  };

  const handleReset = () => {
    resetSettings();
    const defaultSettings = getSettings();
    setOutputFormat(defaultSettings.outputFormat);
    setCrawlDepth(defaultSettings.crawlDepth);
    setEnableCompanyTags(defaultSettings.enableCompanyTags);
    setRenderJs(defaultSettings.renderJs);
    setMaxPages(defaultSettings.maxPages);
    toast({
      title: "Settings reset",
      description: "All settings have been restored to defaults.",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="mr-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-primary shadow-elegant">
              <SettingsIcon className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">Configure scraper preferences</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Card className="p-6 shadow-elegant space-y-8">
          {/* Output Format */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="output-format" className="text-base font-semibold">
                Export Format
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Choose the default format for exporting investment data
              </p>
            </div>
            <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as OutputFormat)}>
              <SelectTrigger id="output-format" className="w-full">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
                <SelectItem value="json">JSON (.json)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Crawl Depth */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="crawl-depth" className="text-base font-semibold">
                Crawl Depth: {crawlDepth} {crawlDepth === 1 ? "level" : "levels"}
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                How many levels deep to crawl from the starting URL (1-5)
              </p>
            </div>
            <div className="px-2">
              <Slider
                id="crawl-depth"
                min={1}
                max={5}
                step={1}
                value={[crawlDepth]}
                onValueChange={(value) => setCrawlDepth(value[0])}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>1 (Shallow)</span>
                <span>3 (Balanced)</span>
                <span>5 (Deep)</span>
              </div>
            </div>
          </div>

          {/* Max Pages */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="max-pages" className="text-base font-semibold">
                Maximum Pages: {maxPages}
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Maximum number of pages to scrape, including paginated results (10-200)
              </p>
            </div>
            <div className="px-2">
              <Slider
                id="max-pages"
                min={10}
                max={200}
                step={10}
                value={[maxPages]}
                onValueChange={(value) => setMaxPages(value[0])}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>10 (Quick)</span>
                <span>100 (Balanced)</span>
                <span>200 (Exhaustive)</span>
              </div>
            </div>
          </div>

          {/* Company Tags */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="company-tags" className="text-base font-semibold">
                  Company Name Tagging
                </Label>
                <p className="text-sm text-muted-foreground">
                  Automatically extract and tag company names from scraped data
                </p>
              </div>
              <Switch
                id="company-tags"
                checked={enableCompanyTags}
                onCheckedChange={setEnableCompanyTags}
              />
            </div>
          </div>

          {/* JavaScript Rendering */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="render-js" className="text-base font-semibold">
                  JavaScript Rendering
                </Label>
                <p className="text-sm text-muted-foreground">
                  Enable headless browser mode to scrape dynamic content loaded via JavaScript
                </p>
              </div>
              <Switch
                id="render-js"
                checked={renderJs}
                onCheckedChange={setRenderJs}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={handleSave}
              className="flex-1 bg-gradient-primary hover:opacity-90 transition-opacity shadow-elegant"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              className="flex-1"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
          </div>
        </Card>

        {/* Info Card */}
        <Card className="p-4 mt-6 bg-muted/50">
          <h3 className="font-semibold text-sm mb-2">About Settings</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Settings are saved locally in your browser</li>
            <li>• Crawl depth affects scraping time and Firecrawl credits used</li>
            <li>• Company tagging enhances data organization</li>
            <li>• All exports will use your selected format by default</li>
          </ul>
        </Card>
      </main>
    </div>
  );
};

export default Settings;
