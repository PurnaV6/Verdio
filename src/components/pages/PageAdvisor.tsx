import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { buildAdvisorContext } from "../../lib/analysis/factSummary";
import { parseChartTagsFromAI, localAnalysisFallback } from "../../lib/analysis/chatChartIntent";
import type { ChartSpec } from "../../types/analysis";
import type { PipelineResult } from "../../types/pipeline";
import { ChartRenderer } from "../workspace/lazy";

export function PageAdvisor({ r }: { r: PipelineResult }) {
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text?: string; charts?: ChartSpec[]; sources?: string[] }[]>([{ role: 'ai', text: `Full analysis loaded — ${r.source.rowCount} rows, ${r.analyses.length} charts, health ${r.decision.health.total}/100. Choose a decision task below or ask a specific question.`, sources: [r.source.fileName, 'Verd.io decision engine'] }]);
  const [input, setInput] = useState(''); const [loading, setLoading] = useState(false); const PROXY = '/api/chat'; const context = buildAdvisorContext(r);
  const quickActions = ['Explain the highest risk', 'Create a 30-day action plan', 'Compare recent performance', 'Summarise for the board'];
  async function send(prompt?: string) {
    const userMsg = (prompt || input).trim(); if (!userMsg) return; setInput(''); setMessages(m => [...m, { role: 'user', text: userMsg }]); setLoading(true);
    try {
      const groundedPrompt = `${userMsg}\n\nUse only the supplied Verd.io analysis. State the supporting metric or analysis and finish with a concrete next action. Add [CHART:analysis_id] when a chart supports the answer.`;
      const res = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: context }, { role: 'user', content: groundedPrompt }], max_tokens: 700 }) });
      const data = await res.json(); const txt = data.choices?.[0]?.message?.content; if (!txt) throw new Error('empty');
      const { cleanText, charts } = parseChartTagsFromAI(txt, r); setMessages(m => [...m, { role: 'ai', text: cleanText, charts, sources: [r.source.fileName, ...charts.map(c=>c.title || 'Supporting analysis')] }]);
    } catch { const fb = localAnalysisFallback(userMsg, r); setMessages(m => [...m, { role: 'ai', text: fb.text, charts: fb.charts, sources: [r.source.fileName, 'Local analysis fallback'] }]); }
    setLoading(false);
  }
  return <div className="advisor-workspace"><div className="advisor-actions"><div><strong>Decision tasks</strong><span>Grounded in {r.source.fileName}</span></div>{quickActions.map(action=><button key={action} disabled={loading} onClick={()=>send(action)}>{action}<ChevronRight size={13}/></button>)}</div><div className="advisor-conversation"><div className="advisor-messages">{messages.map((msg,i)=><div key={i} className={`flex ${msg.role==='user'?'justify-end':''}`}><div className={`advisor-message ${msg.role==='user'?'is-user':'is-ai'}`}>{msg.text}{msg.charts?.map((c,j)=><div key={j} className="mt-3 bg-white border rounded-xl p-2"><ChartRenderer chart={c} /></div>)}{msg.sources&&<div className="advisor-sources"><span>Evidence</span>{msg.sources.map(source=><small key={source}>{source}</small>)}</div>}</div></div>)}{loading && <div className="advisor-thinking"><Sparkles size={13}/> Analysing the supporting evidence…</div>}</div><div className="advisor-input"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Ask about a risk, forecast, customer segment or decision…" /><button disabled={loading} onClick={()=>send()}>Send</button></div></div></div>;
}
