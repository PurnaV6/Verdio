import { useEffect, useState } from 'react';
import { getSupabase } from './supabaseClient';

export type OrganizationRole = 'owner' | 'admin' | 'analyst' | 'viewer';
export function useOrganizationAccess() {
  const [role,setRole]=useState<OrganizationRole|null>(null); const [loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;const sb=getSupabase();if(!sb){setLoading(false);return}void sb.auth.getUser().then(async({data})=>{if(!data.user){if(active)setLoading(false);return}const {data:membership}=await sb.from('organization_members').select('role').eq('user_id',data.user.id).limit(1).maybeSingle();if(active){setRole((membership?.role as OrganizationRole)||null);setLoading(false)}});return()=>{active=false}},[]);
  return {role,loading,canAnalyze:role!=='viewer',canManageOrganization:role==='owner'||role==='admin',canSchedule:role==='owner'||role==='admin'};
}
