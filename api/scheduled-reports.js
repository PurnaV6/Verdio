function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
function nextRun(cadence) { const date=new Date(); if(cadence==='weekly') date.setDate(date.getDate()+7); else date.setMonth(date.getMonth()+1); return date.toISOString(); }

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  if(!process.env.CRON_SECRET || req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({error:'Unauthorized'});
  const url=process.env.SUPABASE_URL; const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY; const resendKey=process.env.RESEND_API_KEY; const from=process.env.REPORT_FROM_EMAIL;
  if(!url||!serviceKey||!resendKey||!from) return res.status(503).json({error:'Scheduler environment is incomplete'});
  const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};
  const due=await fetch(`${url}/rest/v1/report_schedules?active=eq.true&next_run_at=lte.${encodeURIComponent(new Date().toISOString())}&select=*`,{headers});
  if(!due.ok) return res.status(502).json({error:'Unable to load schedules'});
  const schedules=await due.json(); const results=[];
  for(const schedule of schedules){
    const snapshot=schedule.snapshot||{}; const risks=(snapshot.risks||[]).map(item=>`<li><strong>${escapeHtml(item.title)}</strong> — ${escapeHtml(item.desc)}</li>`).join(''); const actions=(snapshot.recommendations||[]).map(item=>`<li><strong>${escapeHtml(item.title)}</strong> — ${escapeHtml(item.desc)}</li>`).join('');
    const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[schedule.recipient_email],subject:`Verdio executive brief — ${schedule.dataset_key}`,html:`<h1>Verdio executive brief</h1><p>Dataset: <strong>${escapeHtml(schedule.dataset_key)}</strong></p><p>Business health: <strong>${snapshot.health??'—'}/100</strong> · Data quality: <strong>${snapshot.quality??'—'}/100</strong></p><h2>Priority risks</h2><ul>${risks||'<li>No material risks recorded.</li>'}</ul><h2>Recommended actions</h2><ul>${actions||'<li>No actions recorded.</li>'}</ul><p>This automated brief is based on the latest saved Verdio snapshot.</p>`})});
    const status=sent.ok?'delivered':'failed'; await fetch(`${url}/rest/v1/report_schedules?id=eq.${schedule.id}`,{method:'PATCH',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify({last_run_at:new Date().toISOString(),last_status:status,next_run_at:nextRun(schedule.cadence),updated_at:new Date().toISOString()})}); results.push({id:schedule.id,status});
  }
  return res.status(200).json({processed:results.length,results});
}
