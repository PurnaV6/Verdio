export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const url=process.env.SUPABASE_URL;const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;const resendKey=process.env.RESEND_API_KEY;const from=process.env.REPORT_FROM_EMAIL;
  if(!url||!serviceKey||!resendKey||!from)return res.status(503).json({error:'Invitation email service is not configured'});
  const accessToken=(req.headers.authorization||'').replace(/^Bearer\s+/,'');if(!accessToken)return res.status(401).json({error:'Authentication required'});
  const userResponse=await fetch(`${url}/auth/v1/user`,{headers:{apikey:serviceKey,Authorization:`Bearer ${accessToken}`}});if(!userResponse.ok)return res.status(401).json({error:'Invalid session'});const user=await userResponse.json();
  const invitationId=req.body?.invitationId;if(!invitationId)return res.status(400).json({error:'Invitation id required'});
  const query=await fetch(`${url}/rest/v1/organization_invitations?id=eq.${encodeURIComponent(invitationId)}&invited_by=eq.${user.id}&select=id,email,role,token,expires_at,organizations(name)`,{headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`}});const invitations=await query.json();const invitation=invitations?.[0];if(!invitation)return res.status(404).json({error:'Invitation not found'});
  const origin=req.headers.origin||`https://${req.headers.host}`;const link=`${origin}/?invite=${invitation.token}`;const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[invitation.email],subject:`You’re invited to ${invitation.organizations?.name||'Verdio'}`,html:`<h1>Join ${invitation.organizations?.name||'the Verdio workspace'}</h1><p>You have been invited as <strong>${invitation.role}</strong>.</p><p><a href="${link}">Accept invitation</a></p><p>This invitation expires ${new Date(invitation.expires_at).toUTCString()}.</p>`})});
  if(!sent.ok)return res.status(502).json({error:'Email provider rejected the invitation'});return res.status(200).json({delivered:true});
}
