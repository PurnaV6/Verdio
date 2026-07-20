import { parseDataset } from '../dataPipeline/parseDataset';
import { profileDataset } from '../dataPipeline/profileDataset';
import { classifyColumns } from '../dataPipeline/semanticEngine';
import type { RawRow } from '../../types/dataPipeline';
import type { BusinessRole } from '../../types/semantic';
import type { DatasetPurpose, OrganizationContext, OrganizationDataset, OrganizationRelationship } from '../../types/organization';

export interface PreparedOrganizationWorkspace {
  context: OrganizationContext;
  files: Record<string, File>;
}

function slug(value: string, index: number) {
  return `${value.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'dataset'}-${index + 1}`;
}

function purposeFor(fileName: string, roles: BusinessRole[]): DatasetPurpose {
  const name = fileName.toLowerCase();
  if (/stock|inventory|warehouse|sku balance/.test(name) || roles.includes('inventory')) return 'inventory';
  if (/customer|client|account|crm/.test(name) || (roles.includes('customer') && !roles.includes('revenue'))) return 'customers';
  if (/product|catalog|item|sku/.test(name) || (roles.includes('product') && !roles.includes('date'))) return 'products';
  if (/expense|cost|finance|ledger|invoice/.test(name) || (roles.includes('cost') && !roles.includes('revenue'))) return 'finance';
  if (/sale|order|transaction|revenue/.test(name) || (roles.includes('revenue') && roles.includes('date'))) return 'sales';
  return 'operations';
}

function normalise(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ''); }

function overlap(rowsA: RawRow[], columnA: string, rowsB: RawRow[], columnB: string) {
  const a = new Set(rowsA.slice(0, 2000).map(row=>String(row[columnA] ?? '').trim().toLowerCase()).filter(Boolean));
  const b = new Set(rowsB.slice(0, 2000).map(row=>String(row[columnB] ?? '').trim().toLowerCase()).filter(Boolean));
  if (!a.size || !b.size) return 0;
  let shared = 0; for (const value of a) if (b.has(value)) shared += 1;
  return Math.round((shared / Math.min(a.size, b.size)) * 100);
}

const RELATION_ROLES: BusinessRole[] = ['identifier', 'customer', 'product', 'date', 'location'];

export async function prepareOrganizationWorkspace(input: File[]): Promise<PreparedOrganizationWorkspace> {
  const parsed = await Promise.all(input.map(file=>parseDataset(file)));
  const failed = parsed.find(result=>!result.ok);
  if (failed && !failed.ok) throw new Error(failed.error.message);

  const internal = parsed.map((result,index) => {
    if (!result.ok) throw new Error(result.error.message);
    const profile = profileDataset(result.data.rows);
    const semantics = classifyColumns(result.data.rows, profile);
    const id = slug(result.data.fileName,index);
    const roles = semantics.columns.map(column=>column.businessRole);
    const dataset: OrganizationDataset = {
      id, fileName: result.data.fileName, purpose: purposeFor(result.data.fileName,roles),
      rowCount: result.data.rows.length, columnCount: result.data.headers.length, primary: false,
      columns: semantics.columns.map(column=>({ name: column.columnName, role: column.businessRole, dataType: column.dataType, confidence: column.confidence })),
    };
    return { dataset, rows: result.data.rows, file: input[index] };
  });

  const preferred = internal.find(item=>item.dataset.purpose==='sales') || [...internal].sort((a,b)=>b.dataset.rowCount-a.dataset.rowCount)[0];
  if (preferred) preferred.dataset.primary = true;

  const relationships: OrganizationRelationship[] = [];
  for (let i=0;i<internal.length;i+=1) for (let j=i+1;j<internal.length;j+=1) {
    const left=internal[i], right=internal[j];
    const candidates: OrganizationRelationship[]=[];
    for (const a of left.dataset.columns) for (const b of right.dataset.columns) {
      const sameName = normalise(a.name) === normalise(b.name);
      const sameRole = a.role===b.role && RELATION_ROLES.includes(a.role);
      if (!sameName && !sameRole) continue;
      const overlapPct=overlap(left.rows,a.name,right.rows,b.name);
      const confidence=Math.min(0.99,(sameName ? .5 : 0)+(sameRole ? .24 : 0)+(overlapPct/100)*.35);
      if (confidence < .48) continue;
      candidates.push({ id:`${left.dataset.id}:${a.name}:${right.dataset.id}:${b.name}`, leftDatasetId:left.dataset.id,leftColumn:a.name,rightDatasetId:right.dataset.id,rightColumn:b.name,relationshipType:a.role==='date'?'period_alignment':'shared_key',confidence:Math.round(confidence*100)/100,overlapPct,confirmed:confidence>=.65 });
    }
    relationships.push(...candidates.sort((a,b)=>b.confidence-a.confidence).slice(0,2));
  }

  return {
    context:{ name:'Organisation workspace',datasets:internal.map(item=>item.dataset),relationships,createdAt:new Date().toISOString() },
    files:Object.fromEntries(internal.map(item=>[item.dataset.id,item.file])),
  };
}
