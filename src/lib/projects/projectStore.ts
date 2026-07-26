import type { PipelineResult } from '../../types/pipeline';
import { getSupabase } from '../auth/supabaseClient';

export interface SavedProject { id: string; name: string; updatedAt: string; result: PipelineResult; shared?: boolean; organizationId?: string; }
interface Membership { organization_id: string; role: 'owner'|'admin'|'analyst'|'viewer'; }
const DB_NAME='verdio-workspace'; const STORE_NAME='projects'; const BUCKET='organization-projects';

function openDatabase():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE_NAME))request.result.createObjectStore(STORE_NAME,{keyPath:'id'})};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function requestResult<T>(request:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function saveLocal(record:SavedProject){const db=await openDatabase();await requestResult(db.transaction(STORE_NAME,'readwrite').objectStore(STORE_NAME).put(record));db.close()}
async function listLocal(){const db=await openDatabase();const records=await requestResult(db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll()) as SavedProject[];db.close();return records}
async function deleteLocal(id:string){const db=await openDatabase();await requestResult(db.transaction(STORE_NAME,'readwrite').objectStore(STORE_NAME).delete(id));db.close()}
async function membership():Promise<Membership|null>{const sb=getSupabase();if(!sb)return null;const {data:{user}}=await sb.auth.getUser();if(!user)return null;const {data}=await sb.from('organization_members').select('organization_id,role').eq('user_id',user.id).limit(1).maybeSingle();return data as Membership|null}
async function audit(organizationId:string,event:string,projectId:string,metadata:Record<string,unknown>={}){const sb=getSupabase();if(sb)await sb.rpc('record_organization_audit',{target_organization:organizationId,target_event:event,target_entity_type:'project',target_entity_id:projectId,target_metadata:metadata})}

export async function saveProject(result:PipelineResult,existingId?:string):Promise<string>{
  const id=existingId||crypto.randomUUID();const name=result.source.fileName.replace(/\.[^.]+$/,'');const updatedAt=new Date().toISOString();const record:SavedProject={id,name,updatedAt,result};
  await saveLocal(record);
  const sb=getSupabase();const member=await membership();if(!sb||!member||member.role==='viewer')return id;
  const path=`${member.organization_id}/${id}.json`;const payload=new Blob([JSON.stringify(result)],{type:'application/json'});const upload=await sb.storage.from(BUCKET).upload(path,payload,{contentType:'application/json',upsert:true});if(upload.error)return id;
  const {data:{user}}=await sb.auth.getUser();if(!user)return id;
  const {data:existing}=await sb.from('organization_projects').select('id').eq('id',id).eq('organization_id',member.organization_id).maybeSingle();
  const values={name,dataset_key:result.source.fileName,storage_path:path,row_count:result.source.rowCount,health_score:result.decision.health.total,quality_score:result.quality.overallScore,status:'active',updated_at:updatedAt};
  const saved=existing?await sb.from('organization_projects').update(values).eq('id',id):await sb.from('organization_projects').insert({id,organization_id:member.organization_id,owner_user_id:user.id,...values});
  if(saved.error){await sb.storage.from(BUCKET).remove([path]);return id}
  await audit(member.organization_id,existingId?'project.updated':'project.created',id,{name,rowCount:result.source.rowCount});return id;
}

export async function listProjects():Promise<SavedProject[]>{
  const local=await listLocal();const sb=getSupabase();const member=await membership();if(!sb||!member)return local.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const {data:metadata}=await sb.from('organization_projects').select('id,name,updated_at,storage_path,organization_id').eq('organization_id',member.organization_id).eq('status','active').order('updated_at',{ascending:false}).limit(20);
  const shared=(await Promise.all((metadata||[]).map(async item=>{const {data,error}=await sb.storage.from(BUCKET).download(item.storage_path);if(error||!data)return null;try{return{id:item.id,name:item.name,updatedAt:item.updated_at,result:JSON.parse(await data.text()) as PipelineResult,shared:true,organizationId:item.organization_id} satisfies SavedProject}catch{return null}}))).filter((item):item is SavedProject=>Boolean(item));
  const merged=new Map<string,SavedProject>();local.forEach(item=>merged.set(item.id,item));shared.forEach(item=>merged.set(item.id,item));return [...merged.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProject(id:string):Promise<void>{
  const sb=getSupabase();const member=await membership();if(sb&&member&&member.role!=='viewer'){const {data:project}=await sb.from('organization_projects').select('storage_path,name').eq('id',id).eq('organization_id',member.organization_id).maybeSingle();if(project){await sb.storage.from(BUCKET).remove([project.storage_path]);await sb.from('organization_projects').delete().eq('id',id);await audit(member.organization_id,'project.deleted',id,{name:project.name})}}
  await deleteLocal(id);
}
export async function recordProjectOpened(project:SavedProject){if(project.organizationId)await audit(project.organizationId,'project.opened',project.id,{name:project.name})}
