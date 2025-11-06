import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';

interface StageInfo {
  name: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  message?: string;
  progress?: number;
  details?: {
    pagesDiscovered?: number;
    pagesProcessed?: number;
    investmentsFound?: number;
    cacheHits?: number;
    cacheMisses?: number;
  };
}

interface ProgressState {
  validation: StageInfo;
  discovery: StageInfo;
  extraction: StageInfo;
  processing: StageInfo;
  complete: StageInfo;
}

interface ScrapingProgressProps {
  requestId: string;
}

const STAGE_ORDER = ['validation', 'discovery', 'extraction', 'processing', 'complete'];
const STAGE_LABELS = {
  validation: 'Validation',
  discovery: 'Discovery',
  extraction: 'Extraction',
  processing: 'Processing',
  complete: 'Complete',
};

export const ScrapingProgress = ({ requestId }: ScrapingProgressProps) => {
  const [progressState, setProgressState] = useState<ProgressState | null>(null);

  useEffect(() => {
    if (!requestId) return;

    // Fetch initial state
    const fetchInitialState = async () => {
      const { data, error } = await supabase
        .from('scraping_progress')
        .select('stages')
        .eq('request_id', requestId)
        .single();

      if (!error && data) {
        setProgressState(data.stages as unknown as ProgressState);
      }
    };

    fetchInitialState();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`progress-${requestId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraping_progress',
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          console.log('Progress update:', payload);
          if (payload.new && 'stages' in payload.new) {
            setProgressState(payload.new.stages as unknown as ProgressState);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  if (!progressState) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Initializing...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'in_progress':
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scraping Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {STAGE_ORDER.map((stageKey) => {
          const stage = progressState[stageKey as keyof ProgressState];
          if (!stage) return null;

          return (
            <div key={stageKey} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStageIcon(stage.status)}
                  <span className="font-medium">{STAGE_LABELS[stageKey as keyof typeof STAGE_LABELS]}</span>
                  <span className="text-sm text-muted-foreground capitalize">
                    {stage.status === 'in_progress' ? 'In Progress' : stage.status}
                  </span>
                </div>
              </div>
              
              {stage.message && (
                <p className="text-sm text-muted-foreground pl-7">{stage.message}</p>
              )}
              
              {stage.progress !== undefined && stage.status === 'in_progress' && (
                <div className="pl-7">
                  <Progress value={stage.progress} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">{stage.progress}%</p>
                </div>
              )}
              
              {stage.details && (
                <div className="pl-7 text-xs text-muted-foreground space-y-1">
                  {stage.details.pagesDiscovered !== undefined && (
                    <p>📄 {stage.details.pagesDiscovered} pages discovered</p>
                  )}
                  {stage.details.pagesProcessed !== undefined && (
                    <p>⚙️ {stage.details.pagesProcessed} pages processed</p>
                  )}
                  {stage.details.investmentsFound !== undefined && (
                    <p>💼 {stage.details.investmentsFound} investments found</p>
                  )}
                  {stage.details.cacheHits !== undefined && (
                    <p>⚡ {stage.details.cacheHits} cache hits / {stage.details.cacheMisses} misses</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
