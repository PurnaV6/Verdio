import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/auth/supabaseClient';
import { useOrganizationAccess } from '../../lib/auth/useOrganizationAccess';
import { Figure, Figures, InlineEmpty, PageHead } from '../pages/PageParts';

type Role = 'owner' | 'admin' | 'analyst' | 'viewer';
interface Organization { id: string; name: string; owner_user_id: string; }
interface Member { user_id: string; email: string; role: Role; }
interface Invitation { id: string; email: string; role: Exclude<Role,'owner'>; status: string; }

export function PageTeamWorkspace() {
  const access=useOrganizationAccess();
  const [organization,setOrganization]=useState<Organization|null>(null); const [members,setMembers]=useState<Member[]>([]); const [invitations,setInvitations]=useState<Invitation[]>([]);
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [role,setRole]=useState<Exclude<Role,'owner'>>('analyst'); const [message,setMessage]=useState(''); const [loading,setLoading]=useState(true);
  async function audit(event:string,entityId:string,metadata:Record<string,unknown>={}){const sb=getSupabase();if(sb&&organization)await sb.rpc('record_organization_audit',{target_organization:organization.id,target_event:event,target_entity_type:'membership',target_entity_id:entityId,target_metadata:metadata})}
  async function load(){const sb=getSupabase();if(!sb){setMessage('Supabase is not configured.');setLoading(false);return}const {data:{user}}=await sb.auth.getUser();if(!user){setMessage('Sign in to manage a team workspace.');setLoading(false);return}const {data:orgs}=await sb.from('organizations').select('id,name,owner_user_id').limit(1);const org=orgs?.[0] as Organization|undefined;setOrganization(org||null);if(org){const [{data:m},{data:i}]=await Promise.all([sb.from('organization_members').select('user_id,email,role').eq('organization_id',org.id),sb.from('organization_invitations').select('id,email,role,status').eq('organization_id',org.id).order('created_at',{ascending:false})]);setMembers((m||[]) as Member[]);setInvitations((i||[]) as Invitation[])}setLoading(false)}
  useEffect(()=>{void load()},[]);
  async function create(){const sb=getSupabase();if(!sb||!name.trim())return;setMessage('');const {data:{user}}=await sb.auth.getUser();if(!user)return;const {data:org,error}=await sb.from('organizations').insert({name:name.trim(),owner_user_id:user.id}).select().single();if(error){setMessage(error.message);return}const member=await sb.from('organization_members').insert({organization_id:org.id,user_id:user.id,email:user.email||'',role:'owner'});if(member.error){setMessage(member.error.message);return}setName('');await load()}
  async function invite(){const sb=getSupabase();if(!sb||!organization||!email.includes('@')||!access.canManageOrganization)return;const invitedEmail=email.trim().toLowerCase();const {data:{session}}=await sb.auth.getSession();const user=session?.user;if(!user||!session)return;const {data:invitation,error}=await sb.from('organization_invitations').insert({organization_id:organization.id,email:invitedEmail,role,invited_by:user.id}).select('id').single();if(error){setMessage(error.message);return}const sent=await fetch('/api/invitations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({invitationId:invitation.id})});const response=await sent.json().catch(()=>({}));setMessage(sent.ok?'Invitation email sent.':response.error||'Invitation recorded, but email delivery failed.');await audit('invitation.created',invitation.id,{email:invitedEmail,role});setEmail('');await load()}
  async function changeRole(userId:string,next:Role){const sb=getSupabase();if(!sb||!organization||next==='owner')return;const {error}=await sb.from('organization_members').update({role:next}).eq('organization_id',organization.id).eq('user_id',userId);setMessage(error?.message||'Role updated.');if(!error){await audit('membership.role_changed',userId,{role:next});await load()}}
  if(loading)return <div className="v2-view"><InlineEmpty message="Loading organisation workspace…"/></div>;
  const statusNote=(title:string)=>message&&<aside className="v2-note-block" role="status"><h2>{title}</h2><p>{message}</p></aside>;
  if(!organization)return <div className="v2-view"><PageHead eyebrow="Organisation" title="Create your team workspace">Establish an organisation before inviting colleagues and assigning controlled access.</PageHead>
    <section className="v2-op-sect"><h2>Organisation name</h2><p className="v2-muted">This becomes the secure boundary for members and roles.</p>
      <div className="v2-op-form"><label className="v2-op-field"><span>Organisation name</span><input className="v2-op-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Company name"/></label><button type="button" className="v2-op-btn is-primary" onClick={create}>Create workspace</button></div></section>
    {statusNote('Setup status')}</div>;
  const pending=invitations.filter(i=>i.status==='pending').length;
  return <div className="v2-view"><PageHead eyebrow="Organisation" title={organization.name}>Manage membership and least-privilege access across this organisation.</PageHead>
    <Figures label="Team summary"><Figure label="Active members" value={members.length} sub="Role protected"/><Figure label="Pending invitations" value={pending}/></Figures>
    <section className="v2-op-sect"><h2>Members</h2>
      <div className="v2-table-wrap" role="region" aria-label="Members" tabIndex={0}><table className="v2-table"><caption className="sr-only">Organisation members and their roles</caption>
        <thead><tr><th scope="col">Member</th><th scope="col">Access</th><th scope="col">Role</th></tr></thead>
        <tbody>{members.map(member=><tr key={member.user_id}><th scope="row" className="v2-op-wrap">{member.email}</th><td>{member.role==='owner'?'Organisation owner':'Workspace member'}</td><td>{member.role==='owner'?<strong>Owner</strong>:<label><span className="sr-only">Role for {member.email}</span><select className="v2-op-input" value={member.role} onChange={e=>changeRole(member.user_id,e.target.value as Role)}><option value="admin">Admin</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option></select></label>}</td></tr>)}</tbody></table></div></section>
    <section className="v2-op-sect"><h2>Invite a colleague</h2>
      <div className="v2-op-form"><label className="v2-op-field"><span>Colleague email</span><input className="v2-op-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="colleague@company.com"/></label><label className="v2-op-field"><span>Role</span><select className="v2-op-input" value={role} onChange={e=>setRole(e.target.value as Exclude<Role,'owner'>)}><option value="admin">Admin</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option></select></label><button type="button" className="v2-op-btn is-primary" onClick={invite}>Record invitation</button></div>
      {invitations.length>0&&<div className="v2-table-wrap" role="region" aria-label="Invitations" tabIndex={0}><table className="v2-table"><caption className="sr-only">Invitations sent</caption>
        <thead><tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th></tr></thead>
        <tbody>{invitations.map(item=><tr key={item.id}><th scope="row" className="v2-op-wrap">{item.email}</th><td>{item.role}</td><td>{item.status}</td></tr>)}</tbody></table></div>}</section>
    {statusNote('Workspace status')}</div>;
}
