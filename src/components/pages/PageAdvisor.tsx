import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { askAssistant } from "../../services/ai";
import { noticeFor, canRetry } from "../../services/aiNotice";
import { buildAdvisorContext } from "../../lib/analysis/factSummary";
import { parseChartTagsFromAI, localAnalysisFallback } from "../../lib/analysis/chatChartIntent";
import type { ChartSpec } from "../../types/analysis";
import type { PipelineResult } from "../../types/pipeline";
import { AdvisorChart } from "./AdvisorChart";
import { PageHead } from "./PageParts";
import { pageLabel } from "../workspace/navigation";

export function PageAdvisor({ r }: { r: PipelineResult }) {
  const [messages, setMessages] = useState<{ role: 'ai' | 'user'; text?: string; charts?: ChartSpec[]; sources?: string[]; origin?: 'ai' | 'built-in'; retryPrompt?: string }[]>([{ role: 'ai', text: `Full analysis loaded: ${r.source.rowCount} rows, ${r.analyses.length} charts, health ${r.decision.health.total}/100. Choose a decision task below or ask a specific question.`, sources: [r.source.fileName, 'Verd.io decision engine'] }]);
  const [input, setInput] = useState(''); const [loading, setLoading] = useState(false); const context = buildAdvisorContext(r);
  const quickActions = ['Explain the highest risk', 'Create a 30-day action plan', 'Compare recent performance', 'Summarise for the board'];
  async function send(prompt?: string) {
    const userMsg = (prompt || input).trim(); if (!userMsg) return; setInput(''); setMessages(m => [...m, { role: 'user', text: userMsg }]); setLoading(true);
    try {
      const outcome = await askAssistant('advisor', context, userMsg); if (!outcome.ok) throw outcome;
      const { cleanText, charts } = parseChartTagsFromAI(outcome.result, r); setMessages(m => [...m, { role: 'ai', text: cleanText, charts, sources: [r.source.fileName, ...charts.map(c=>c.title || 'Supporting analysis')], origin: 'ai' }]);
    } catch (failure) { const fb = localAnalysisFallback(userMsg, r); const outcome = failure as Exclude<Awaited<ReturnType<typeof askAssistant>>, { ok: true }>; const notice = noticeFor(outcome.reason, outcome.retryAfterSeconds); setMessages(m => [...m, { role: 'ai', text: `${notice} ${fb.text}`, charts: fb.charts, sources: [r.source.fileName, 'Local analysis fallback'], origin: 'built-in', retryPrompt: canRetry(outcome.reason) ? userMsg : undefined }]); }
    setLoading(false);
  }
  return <div className="v2-view"><PageHead eyebrow="Intelligence" title={pageLabel('advisor')}>Ask questions grounded in your uploaded data.</PageHead><div className="v2-advisor"><div className="v2-advisor-actions"><div><h2>Decision tasks</h2><p className="v2-tag">Grounded in <b>{r.source.fileName}</b></p></div>{quickActions.map(action=><button key={action} type="button" disabled={loading} onClick={()=>send(action)}>{action}<ChevronRight size={14} aria-hidden="true"/></button>)}</div><div className="v2-advisor-conversation"><div className="v2-advisor-messages" role="log" aria-live="polite" aria-label="Conversation">{messages.map((msg,i)=><div key={i} className={`v2-advisor-row ${msg.role==='user'?'is-user':''}`}><div className={`v2-advisor-message ${msg.role==='user'?'is-user':'is-ai'}`}>{msg.origin&&<span className={`v2-ai-source ${msg.origin==='ai'?'is-ai':'is-built-in'}`}>{msg.origin==='ai'?'AI':'Built-in'}</span>}{msg.text}{msg.charts?.map((c,j)=><div key={j} className="v2-advisor-chart"><AdvisorChart chart={c} /></div>)}{msg.sources&&<div className="v2-advisor-sources"><span className="v2-tag">Evidence</span>{msg.sources.map(source=><small key={source} className="v2-tag"><b>{source}</b></small>)}</div>}{msg.retryPrompt&&!loading&&i===messages.length-1&&<button type="button" className="v2-ai-retry" onClick={()=>send(msg.retryPrompt)}>Try again</button>}</div></div>)}{loading && <div className="v2-advisor-thinking">AI is analysing the supporting evidence…</div>}</div><div className="v2-advisor-input"><input aria-label="Ask the AI Advisor" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Ask about a risk, forecast, customer segment or decision…" /><button type="button" disabled={loading} onClick={()=>send()}>Send</button></div></div></div></div>;
}
