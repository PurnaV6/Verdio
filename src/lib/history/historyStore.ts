/* ================================================================
   VERDIO — History Store (Viability for Innovator Visa)
   Gives you SaaS persistence without needing Supabase yet.
   Saves every PipelineResult to localStorage, shows history page,
   proves retention and recurring use which endorsing bodies ask for.

   Drop in: src/lib/history/historyStore.ts
   No new dependencies.
   ================================================================ */

export interface HistoryItem {
  id: string;
  fileName: string;
  fileType: string;
  rowCount: number;
  healthScore: number;
  qualityScore: number;
  capabilitiesCount: string;
  topRisk: string;
  topAction: string;
  createdAt: string; // ISO
  vdeSummary?: string;
  totalValueAtRisk?: number;
}

const KEY = 'verdio_history_v2';
const MAX_ITEMS = 20;

export function saveToHistory(result: any): void {
  try {
    const existing = loadHistory();
    const item: HistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      fileName: result.source.fileName,
      fileType: result.source.fileType,
      rowCount: result.source.rowCount,
      healthScore: result.decision.health.total,
      qualityScore: result.quality.overallScore,
      capabilitiesCount: `${result.capabilities.available.length}/${result.capabilities.capabilities.length}`,
      topRisk: result.decision.risks[0]?.title || 'No critical risk',
      topAction: result.decision.recommendations[0]?.title || 'No action',
      createdAt: new Date().toISOString(),
      vdeSummary: result._vdeMeta?.summary || '',
      totalValueAtRisk: result._vdeMeta?.totalValueAtRisk || 0
    };
    const next = [item, ...existing].slice(0, MAX_ITEMS);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('History save failed', e);
  }
}

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}
