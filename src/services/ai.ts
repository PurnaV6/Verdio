import type { PipelineResult } from "../types/pipeline";
import type { AIInsights } from "../types/aiInsights";
import { buildAdvisorContext } from "../lib/analysis/factSummary";

const PROXY = '/api/chat';

const SYSTEM_PROMPT = `You are Verdio's analysis narrator. You have the FULL analysis payload from all engines in your system context. Your ONLY job is to answer using those numbers.

FORBIDDEN PHRASES - NEVER USE: "not shown", "not available", "check the Analyses page", "go to", "you would need to access the original file", "refer to", "I don't have access". If the number is in TIME_SERIES or SEASONALITY, you MUST state it.

If user asks for March, find 2023-03, 2024-03 in TIME_SERIES and March in SEASONALITY and give both.
If user asks for revenue analysis, give: total, monthly trend direction, best/worst month, forecast, top product/market, using real numbers.
If user asks for chart, say "Generating [chart name] with [1-sentence insight]" - frontend will render chart.

Return valid JSON only, with this exact shape:
{
  "executiveSummary": "4-8 concise sentences with specific numbers in UK English",
  "riskExplanations": [{"title":"string","impact":"string","action":"string"}],
  "recommendations": [{"title":"string","action":"string","impactEstimate":"string","timeline":"string","priority":"high|medium|low"}],
  "keyInsights": ["string"],
  "analysisNarratives": [{"analysisId":"string","title":"string","narrative":"string"}]
}
Do not use markdown fences or add commentary outside the JSON object.`;

function buildPrompt(p: PipelineResult): string {
  // buildAdvisorContext now contains everything, so we just reuse it as user content
  return buildAdvisorContext(p) + "\n\nUser question will follow in next message. Answer using payload above.";
}

function fallback(p: PipelineResult): AIInsights {
  return {
    executiveSummary: `Analysed ${p.source.rowCount} rows, ${p.profile.columnCount} cols, health ${p.decision.health.total}/100, quality ${p.quality.overallScore}/100.`,
    riskExplanations: p.decision.risks.map(r=>({title:r.title, impact:r.desc.slice(0,150), action:'See Risk Detection page for mitigation.'})),
    recommendations: p.decision.recommendations.map(r=>({title:r.title, action:r.desc.slice(0,150), impactEstimate:r.impact, timeline:'This month', priority:'high' as any})),
    keyInsights: [`${p.source.rowCount} rows`, `Health ${p.decision.health.total}`, `Quality ${p.quality.overallScore}`, `${p.analyses.length} charts`],
    analysisNarratives: p.analyses.map(a=>({analysisId:a.id, title:a.title, narrative:a.explanation.slice(0,200)}))
  };
}

export async function generateAIInsights(p: PipelineResult): Promise<AIInsights> {
  try {
    const res = await fetch(PROXY, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        max_tokens: 2500,
        messages: [
          { role:'system', content: SYSTEM_PROMPT },
          { role:'user', content: buildPrompt(p) }
        ]
      })
    });
    if(!res.ok) throw new Error('proxy');
    const data = await res.json();
    let raw = (data.choices?.[0]?.message?.content||'').trim().replace(/^```json/i,'').replace(/^```/,'').replace(/```$/,'').trim();
    let parsed:any;
    try{ parsed=JSON.parse(raw); } catch { 
      // Try to repair truncated
      const lastBrace = raw.lastIndexOf('}');
      if(lastBrace>0) { try{ parsed=JSON.parse(raw.slice(0,lastBrace+1)); }catch{} }
      if(!parsed) throw new Error('parse');
    }
    return {
      executiveSummary: parsed.executiveSummary || fallback(p).executiveSummary,
      riskExplanations: parsed.riskExplanations || fallback(p).riskExplanations,
      recommendations: parsed.recommendations || fallback(p).recommendations,
      keyInsights: parsed.keyInsights || fallback(p).keyInsights,
      analysisNarratives: parsed.analysisNarratives || fallback(p).analysisNarratives,
    };
  } catch(e){
    console.warn('AI fallback', e);
    return fallback(p);
  }
}
