import type { PipelineResult } from "../../types/pipeline";

export function buildAdvisorContext(p: PipelineResult): string {
  const risks = p.decision.risks.map(r=>`[${r.level}] ${r.title}: ${r.desc}`).join('\n');
  const recs = p.decision.recommendations.map(r=>`[${r.impact}] ${r.title}: ${r.desc}`).join('\n');
  const analyses = p.analyses.map(a=>`ID="${a.id}" Title="${a.title}"`).join('\n');
  const ts = p.statistics.timeSeries[0];
  const tsText = ts ? ts.points.slice(-12).map(pt=>`${pt.periodKey}=${Math.round(pt.value)}`).join(', ') : 'none';
  const s = p.statistics.seasonality;
  const seasonText = s ? s.byMonthOfYear.map(m=>`${m.label}=${Math.round(m.value)}`).join(', ') : 'none';
  const organizationText = p.organization
    ? `${p.organization.datasets.map(d=>`${d.fileName}[${d.purpose},${d.rowCount} rows${d.primary?',primary':''}]`).join('; ')}; confirmed relationships: ${p.organization.relationships.filter(r=>r.confirmed).map(r=>`${r.leftColumn}<->${r.rightColumn}`).join(', ') || 'none'}; connected indicators: ${(p.organization.metrics||[]).filter(m=>!m.relationshipId||p.organization!.relationships.some(r=>r.id===m.relationshipId&&r.confirmed)).map(m=>`${m.label}=${m.value.toFixed(2)} ${m.format}`).join(', ')||'none'}; qualified recommendations: ${(p.organization.insights||[]).filter(i=>!i.relationshipId||p.organization!.relationships.some(r=>r.id===i.relationshipId&&r.confirmed)).map(i=>`${i.title} (${Math.round(i.confidence*100)}% confidence)`).join(', ')||'none'}`
    : 'single dataset';
  
  return `You are Verdio Advisor LLM. Full analysis:
Rows=${p.source.rowCount} Health=${p.decision.health.total} Quality=${p.quality.overallScore}
ORGANISATIONAL_CONTEXT: ${organizationText}
TIME_SERIES last 12: ${tsText}
SEASONALITY: ${seasonText}
RISKS: ${risks}
RECS: ${recs}
CHARTS: ${analyses}
If chart helps, add [CHART:id] at end. For risk/improvement, no chart. Use real numbers.`;
}

export function buildTopMoversFact(){return '';}
export function buildPredictiveFact(){return '';}
export function buildYearlySummaryFact(){return '';}
