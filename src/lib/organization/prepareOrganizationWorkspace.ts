import { parseDataset } from '../dataPipeline/parseDataset';
import { profileDataset } from '../dataPipeline/profileDataset';
import { classifyColumns } from '../dataPipeline/semanticEngine';
import type { RawRow } from '../../types/dataPipeline';
import type { BusinessRole } from '../../types/semantic';
import type { DatasetPurpose, OrganizationContext, OrganizationDataset, OrganizationInsight, OrganizationMetric, OrganizationRelationship } from '../../types/organization';

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

function numberValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/[£$€,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericColumn(item: { dataset: OrganizationDataset; rows: RawRow[] }, roles: BusinessRole[]) {
  return item.dataset.columns.find(column=>roles.includes(column.role) && column.dataType==='number')?.name;
}

function totalFor(item: { rows: RawRow[] }, column?: string) {
  return column ? item.rows.reduce((sum,row)=>sum+numberValue(row[column]),0) : 0;
}

function buildIntelligence(
  internal: Array<{ dataset: OrganizationDataset; rows: RawRow[] }>,
  relationships: OrganizationRelationship[],
) {
  const metrics: OrganizationMetric[]=[]; const insights: OrganizationInsight[]=[];
  const sales=internal.find(item=>item.dataset.purpose==='sales');
  const inventory=internal.find(item=>item.dataset.purpose==='inventory');
  const finance=internal.find(item=>item.dataset.purpose==='finance');
  const customers=internal.find(item=>item.dataset.purpose==='customers');

  if(sales){
    const revenueColumn=numericColumn(sales,['revenue']);
    const revenue=totalFor(sales,revenueColumn);
    if(revenueColumn) metrics.push({id:'connected-revenue',label:'Connected revenue',value:revenue,format:'currency',evidence:`Sum of ${revenueColumn} in ${sales.dataset.fileName}`,sourceDatasetIds:[sales.dataset.id]});
  }

  if(sales&&inventory){
    const relation=relationships.find(item=>(
      item.leftDatasetId===sales.dataset.id&&item.rightDatasetId===inventory.dataset.id
    )||(
      item.rightDatasetId===sales.dataset.id&&item.leftDatasetId===inventory.dataset.id
    ));
    const salesKey=relation?.leftDatasetId===sales.dataset.id?relation.leftColumn:relation?.rightColumn;
    const inventoryKey=relation?.leftDatasetId===inventory.dataset.id?relation.leftColumn:relation?.rightColumn;
    const demandColumn=numericColumn(sales,['quantity']);
    const stockColumn=numericColumn(inventory,['inventory','quantity']);
    if(relation&&salesKey&&inventoryKey&&demandColumn&&stockColumn){
      const demandByKey=new Map<string,number>(); const stockByKey=new Map<string,number>();
      sales.rows.forEach(row=>{const key=String(row[salesKey]??'').trim().toLowerCase();if(key)demandByKey.set(key,(demandByKey.get(key)||0)+numberValue(row[demandColumn]))});
      inventory.rows.forEach(row=>{const key=String(row[inventoryKey]??'').trim().toLowerCase();if(key)stockByKey.set(key,(stockByKey.get(key)||0)+numberValue(row[stockColumn]))});
      const matched=[...demandByKey.keys()].filter(key=>stockByKey.has(key));
      const matchedDemand=matched.reduce((sum,key)=>sum+(demandByKey.get(key)||0),0);
      const matchedStock=matched.reduce((sum,key)=>sum+(stockByKey.get(key)||0),0);
      const exposed=matched.filter(key=>(stockByKey.get(key)||0)<(demandByKey.get(key)||0)).length;
      const coverage=matchedDemand>0?matchedStock/matchedDemand*100:0;
      metrics.push({id:'inventory-demand-coverage',label:'Inventory vs represented demand',value:coverage,format:'percentage',evidence:`${matched.length} matched product keys across ${sales.dataset.fileName} and ${inventory.dataset.fileName}`,relationshipId:relation.id,sourceDatasetIds:[sales.dataset.id,inventory.dataset.id]});
      metrics.push({id:'products-requiring-review',label:'Products requiring stock review',value:exposed,format:'number',evidence:`Stock is below demand represented in the uploaded sales period for ${exposed} matched products`,relationshipId:relation.id,sourceDatasetIds:[sales.dataset.id,inventory.dataset.id]});
      if(exposed>0) insights.push({id:'inventory-review',title:'Review replenishment for demand-exposed products',description:`${exposed} of ${matched.length} matched products have recorded stock below the demand represented in the uploaded sales data. This is an exposure indicator, not a reorder quantity.`,action:'Validate lead times, open purchase orders, safety-stock policy and the sales period before changing replenishment levels.',priority:exposed/matched.length>=.25?'high':'medium',confidence:relation.confidence,relationshipId:relation.id,sourceDatasetIds:[sales.dataset.id,inventory.dataset.id]});
      else if(matched.length) insights.push({id:'inventory-balanced',title:'No immediate matched-product stock exposure detected',description:`Recorded stock covers the demand represented in the uploaded sales data across ${matched.length} matched products.`,action:'Continue monitoring demand velocity and supplier lead times before adjusting purchasing.',priority:'opportunity',confidence:relation.confidence,relationshipId:relation.id,sourceDatasetIds:[sales.dataset.id,inventory.dataset.id]});
    }
  }

  if(sales&&customers){
    const relation=relationships.find(item=>(item.leftDatasetId===sales.dataset.id&&item.rightDatasetId===customers.dataset.id)||(item.rightDatasetId===sales.dataset.id&&item.leftDatasetId===customers.dataset.id));
    if(relation){
      metrics.push({id:'customer-linkage',label:'Customer linkage coverage',value:relation.overlapPct,format:'percentage',evidence:`Distinct-key overlap between ${sales.dataset.fileName} and ${customers.dataset.fileName}`,relationshipId:relation.id,sourceDatasetIds:[sales.dataset.id,customers.dataset.id]});
      if(relation.overlapPct<80)insights.push({id:'customer-linkage-review',title:'Strengthen customer record linkage',description:`${relation.overlapPct}% of distinct customer keys overlap across the connected sales and customer datasets.`,action:'Review missing, duplicated or differently formatted customer identifiers before using customer-level recommendations.',priority:relation.overlapPct<50?'high':'medium',confidence:relation.confidence,relationshipId:relation.id,sourceDatasetIds:[sales.dataset.id,customers.dataset.id]});
    }
  }

  if(sales&&finance){
    const revenueColumn=numericColumn(sales,['revenue']); const costColumn=numericColumn(finance,['cost']);
    const revenue=totalFor(sales,revenueColumn); const cost=totalFor(finance,costColumn);
    if(revenueColumn&&costColumn&&revenue>0){
      const contribution=(revenue-cost)/revenue*100;
      metrics.push({id:'cross-source-contribution',label:'Cross-source contribution',value:contribution,format:'percentage',evidence:`Sales revenue less finance costs, divided by sales revenue`,sourceDatasetIds:[sales.dataset.id,finance.dataset.id]});
      insights.push({id:'finance-reconciliation',title:'Reconcile commercial and finance coverage',description:`The connected files imply a ${contribution.toFixed(1)}% contribution before items not represented in the uploaded datasets.`,action:'Confirm that the revenue and cost periods, currencies and accounting scope align before using this as a margin decision.',priority:'opportunity',confidence:.7,sourceDatasetIds:[sales.dataset.id,finance.dataset.id]});
    }
  }
  return {metrics,insights};
}

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

  const intelligence=buildIntelligence(internal,relationships);
  return {
    context:{ name:'Organisation workspace',datasets:internal.map(item=>item.dataset),relationships,...intelligence,createdAt:new Date().toISOString() },
    files:Object.fromEntries(internal.map(item=>[item.dataset.id,item.file])),
  };
}
