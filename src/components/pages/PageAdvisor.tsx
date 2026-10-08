import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { askAssistant, ASSISTANT_NOTICES } from "../../services/ai";
import { buildAdvisorContext } from "../../lib/analysis/factSummary";
import { parseChartTagsFromAI, localAnalysisFallback } from "../../lib/analysis/chatChartIntent";
import type { ChartSpec } from "../../types/analysis";
import type { PipelineResult } from "../../types/pipeline";
import { ChartRenderer } from "../workspace/lazy";
import { PageHead } from "./PageParts";

export function PageAdvisor({ r }: { r: PipelineResult }) {
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text?: string; charts?: ChartSpec[]; sources?: string[] }[]>([{ role: 'ai', text: `Full analysis loaded — ${r.source.rowCount} rows, ${r.analyses.length} charts, health ${r.decision.health.total}/100. Choose a decision task below or ask a specific question.`, sources: [r.source.fileName, 'Verd.io decision engine'] }]);
  const [input, setInput] = useState(''); const [loading, setLoading] = useState(false); const context = buildAdvisorContext(r);
  const quickActions = ['Explain the highest risk', 'Create a 30-day action plan', 'Compare recent performance', 'Summarise for the board'];
  async function send(prompt?: string) {
    const userMsg = (prompt || input).trim(); if (!userMsg) return; setInput(''); setMessages(m => [...m, { role: 'user', text: userMsg }]); setLoading(true);
    try {
      const outcome = await askAssistant('advisor', context, userMsg); if (!outcome.ok) throw outcome.reason;
      const { cleanText, charts } = parseChartTagsFromAI(outcome.result, r); setMessages(m => [...m, { role: 'ai', text: cleanText, charts, sources: [r.source.fileName, ...charts.map(c=>c.title || 'Supporting analysis')] }]);
    } catch (reason) { const fb = localAnalysisFallback(userMsg, r); const notice = reason === 'limit' ? ASSISTANT_NOTICES.limit : reason === 'busy' ? ASSISTANT_NOTICES.busy : ''; setMessages(m => [...m, { role: 'ai', text: notice ? `${notice} ${fb.text}` : fb.text, charts: fb.charts, sources: [r.source.fileName, 'Local analysis fallback'] }]); }
    setLoading(false);
  }
  return <div className="v2-view"><PageHead eyebrow="Intelligence" title="AI Advisor">Ask questions grounded in your uploaded data.</PageHead><div className="v2-advisor"><div className="v2-advisor-actions"><div><h2>Decision tasks</h2><p className="v2-tag">Grounded in <b>{r.source.fileName}</b></p></div>{quickActions.map(action=><button key={action} type="button" disabled={loading} onClick={()=>send(action)}>{action}<ChevronRight size={14} aria-hidden="true"/></button>)}</div><div className="v2-advisor-conversation"><div className="v2-advisor-messages" role="log" aria-live="polite" aria-label="Conversation">{messages.map((msg,i)=><div key={i} className={`v2-advisor-row ${msg.role==='user'?'is-user':''}`}><div className={`v2-advisor-message ${msg.role==='user'?'is-user':'is-ai'}`}>{msg.text}{msg.charts?.map((c,j)=><div key={j} className="v2-advisor-chart"><ChartRenderer chart={c} /></div>)}{msg.sources&&<div className="v2-advisor-sources"><span className="v2-tag">Evidence</span>{msg.sources.map(source=><small key={source} className="v2-tag"><b>{source}</b></small>)}</div>}</div></div>)}{loading && <div className="v2-advisor-thinking"><Sparkles size={14} aria-hidden="true"/> Analysing the supporting evidence…</div>}</div><div className="v2-advisor-input"><input aria-label="Ask the AI Advisor" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Ask about a risk, forecast, customer segment or decision…" /><button type="button" disabled={loading} onClick={()=>send()}>Send</button></div></div></div></div>;
}
