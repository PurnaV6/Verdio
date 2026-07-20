/* ================================================================
   VERDIO — Report Generator (Viability for Innovator Visa)
   Generates a print-ready HTML executive report that the user can
   Save as PDF. No new dependencies, uses browser print.

   Proves to endorsing bodies that Verdio delivers a tangible
   business output, not just a dashboard.

   Drop in: src/lib/export/reportGenerator.ts
   ================================================================ */

export function generateExecutiveReportHTML(result: any): string {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const health = result.decision.health.total;
  const quality = result.quality.overallScore;
  const vde = result._vdeMeta;
  const risks = result.decision.risks || [];
  const recs = result.decision.recommendations || [];
  const modelMeta = result._modelMeta;

  const healthColor = health >= 80 ? '#16A34A' : health >= 60 ? '#D97706' : '#DC2626';
  const healthLabel = health >= 80 ? 'Healthy and Stable' : health >= 60 ? 'Performing with Risks' : 'Attention Required';

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Verdio Executive Decision Report - ${result.source.fileName}</title>
<style>
  body { font-family: Inter, system-ui, -apple-system, sans-serif; color: #0F172A; max-width: 900px; margin: 0 auto; padding: 40px 32px; line-height: 1.6; }
  .header { border-bottom: 3px solid #0F172A; padding-bottom: 20px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-end; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
  .kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0 28px; }
  .kpi-card { border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; background: #F8FAFC; }
  .kpi-label { font-size: 10px; letter-spacing: 0.15em; color: #64748B; font-weight: 700; margin-bottom: 6px; }
  .kpi-value { font-size: 22px; font-weight: 900; }
  .section { margin: 28px 0; }
  .section h2 { font-size: 14px; letter-spacing: 0.15em; text-transform: uppercase; color: #475569; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px; }
  .risk { border-left: 4px solid #DC2626; padding: 12px 16px; margin: 12px 0; background: #FEF2F2; border-radius: 0 8px 8px 0; }
  .rec { border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin: 12px 0; }
  .rec-top { display: flex; justify-content: space-between; gap: 12px; }
  .meta { font-size: 11px; color: #64748B; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #94A3B8; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-weight:900; font-size:22px; letter-spacing:-0.02em;">Verdio</div>
      <div style="font-size:10px; letter-spacing:0.2em; color:#64748B; font-weight:700;">ADAPTIVE INTELLIGENCE — EXECUTIVE DECISION REPORT</div>
      <div style="margin-top:10px;"><span class="badge" style="background:#0F172A; color:white;">${date}</span> <span class="badge" style="background:#F1F5F9; color:#334155;">${result.source.fileName}</span></div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px; letter-spacing:0.15em; color:#64748B; font-weight:700;">HEALTH SCORE</div>
      <div style="font-size:42px; font-weight:900; color:${healthColor}; line-height:1;">${health}<span style="font-size:16px; color:#64748B; font-weight:600;">/100</span></div>
      <div class="badge" style="background:${healthColor}15; color:${healthColor}; margin-top:6px;">${healthLabel}</div>
    </div>
  </div>

  <div class="kpi">
    <div class="kpi-card"><div class="kpi-label">ROWS ANALYSED</div><div class="kpi-value">${result.source.rowCount.toLocaleString()}</div><div class="meta">${result.profile.columnCount} columns</div></div>
    <div class="kpi-card"><div class="kpi-label">DATA QUALITY</div><div class="kpi-value">${quality}/100</div><div class="meta">${result.quality.flags.length ? result.quality.flags[0] : 'No issues'}</div></div>
    <div class="kpi-card"><div class="kpi-label">ANALYSES AVAILABLE</div><div class="kpi-value">${result.capabilities.available.length}/${result.capabilities.capabilities.length}</div><div class="meta">Capability gated</div></div>
    <div class="kpi-card"><div class="kpi-label">VALUE AT RISK</div><div class="kpi-value">£${(vde?.totalValueAtRisk || 0).toLocaleString()}</div><div class="meta">${vde ? 'VDE v2 financially ranked' : ''}</div></div>
  </div>

  ${result.aiInsights?.executiveSummary ? `
  <div class="section">
    <h2>AI Executive Summary</h2>
    <p style="font-size:14px; line-height:1.8;">${result.aiInsights.executiveSummary}</p>
  </div>` : ''}

  ${vde ? `
  <div class="section">
    <h2>Verdio Decision Engine v2 — Financial Ranking</h2>
    <p style="background:#0F172A; color:white; padding:14px 16px; border-radius:10px; font-size:13px; line-height:1.7;">${vde.summary}</p>
    ${modelMeta?.forecast ? `<div class="meta" style="margin-top:8px;">Model selection: <b>${modelMeta.forecast.chosenModel}</b> (confidence ${Math.round(modelMeta.forecast.confidence*100)}%) — ${modelMeta.forecast.reason}</div>` : ''}
  </div>` : ''}

  <div class="section">
    <h2>Top Risks — Ranked by Severity</h2>
    ${risks.slice(0,4).map((r:any)=>`<div class="risk"><div class="badge" style="background:#DC2626; color:white;">${r.level.toUpperCase()}</div> <b style="margin-left:8px;">${r.title}</b><div style="font-size:13px; margin-top:6px; color:#334155;">${r.desc}</div></div>`).join('')}
  </div>

  <div class="section">
    <h2>Prioritised Actions — Ranked by Financial Impact × Confidence / Effort</h2>
    ${recs.slice(0,5).map((rec:any,i:number)=>`
      <div class="rec">
        <div class="rec-top">
          <div style="font-weight:800;">${i+1}. ${rec.title}</div>
          <div class="badge" style="background:${rec.urgency==='immediate'?'#FEF2F2':'#FFFBEB'}; color:${rec.urgency==='immediate'?'#991B1B':'#92400E'}; border:1px solid ${rec.urgency==='immediate'?'#FECACA':'#FDE68A'};">${(rec.urgency||rec.impact||'').toString().toUpperCase().replace('_',' ')}</div>
        </div>
        <div style="font-size:13px; color:#475569; margin:8px 0;">${rec.desc || rec.financialImpact?.basis || ''}</div>
        ${rec.financialImpact ? `
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:10px; font-size:12px;">
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:8px 10px;"><div class="meta">EST. IMPACT</div><b>£${rec.financialImpact.estimatedValue.toLocaleString()}</b><div class="meta">Range £${rec.financialImpact.rangeLow.toLocaleString()}–£${rec.financialImpact.rangeHigh.toLocaleString()}</div></div>
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:8px 10px;"><div class="meta">CONFIDENCE & EFFORT</div><b>${Math.round((rec.confidence||0.8)*100)}% • ${rec.effortDays||5}d</b><div class="meta">${rec.effort||'medium'} effort</div></div>
          <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:8px; padding:8px 10px;"><div class="meta" style="color:#16A34A;">PRIORITY SCORE</div><b style="font-size:16px; color:#16A34A;">${rec.priorityScore||''}/100</b></div>
        </div>` : ''}
      </div>
    `).join('')}
  </div>

  <div class="footer">
    Generated by Verdio Adaptive Intelligence on ${date}. This report is derived from ${result.source.rowCount.toLocaleString()} primary-source rows across ${result.profile.columnCount} columns${result.organization ? ` within an organisational workspace containing ${result.organization.datasets.length} datasets and ${result.organization.relationships.filter((r:any)=>r.confirmed).length} confirmed relationships` : ''}. Semantic confidence and capability gating ensure only mathematically valid analyses are included. Model selection and financial impact are estimates to support decision making, not financial advice.
  </div>

  <div class="no-print" style="text-align:center; margin-top:24px;">
    <button onclick="window.print()" style="background:#0F172A; color:white; border:0; padding:12px 20px; border-radius:999px; font-weight:800; cursor:pointer;">Print / Save as PDF</button>
  </div>
</body>
</html>
`;
}

export function openReport(result: any): void {
  const html = generateExecutiveReportHTML(result);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups to export the report.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function emailExecutiveSummary(result: any): void {
  const topRisk = result.decision.risks?.[0];
  const topAction = result.decision.recommendations?.[0];
  const subject = `Verdio executive summary — ${result.source.fileName}`;
  const body = [
    `Verdio executive summary for ${result.source.fileName}`,
    '',
    `Business health: ${result.decision.health.total}/100`,
    `Data quality: ${result.quality.overallScore}/100`,
    `Rows analysed: ${result.source.rowCount.toLocaleString()}`,
    '',
    topRisk ? `Priority risk: ${topRisk.title}\n${topRisk.desc}` : 'No priority risk identified.',
    '',
    topAction ? `Recommended action: ${topAction.title}\n${topAction.desc}` : 'No immediate action identified.',
    '',
    'Open Verdio to review the supporting evidence and full decision report.',
  ].join('\n');
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
