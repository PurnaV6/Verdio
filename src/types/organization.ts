import type { BusinessRole } from './semantic';

export type DatasetPurpose = 'sales' | 'inventory' | 'customers' | 'products' | 'finance' | 'operations';

export interface OrganizationDataset {
  id: string;
  fileName: string;
  purpose: DatasetPurpose;
  rowCount: number;
  columnCount: number;
  primary: boolean;
  columns: Array<{ name: string; role: BusinessRole; dataType: string; confidence: number }>;
}

export interface OrganizationRelationship {
  id: string;
  leftDatasetId: string;
  leftColumn: string;
  rightDatasetId: string;
  rightColumn: string;
  relationshipType: 'shared_key' | 'period_alignment';
  confidence: number;
  overlapPct: number;
  confirmed: boolean;
}

export interface OrganizationMetric {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'number' | 'percentage';
  evidence: string;
  relationshipId?: string;
  sourceDatasetIds: string[];
}

export interface OrganizationInsight {
  id: string;
  title: string;
  description: string;
  action: string;
  priority: 'high' | 'medium' | 'opportunity';
  confidence: number;
  relationshipId?: string;
  sourceDatasetIds: string[];
}

export interface OrganizationContext {
  name: string;
  datasets: OrganizationDataset[];
  relationships: OrganizationRelationship[];
  metrics: OrganizationMetric[];
  insights: OrganizationInsight[];
  createdAt: string;
}
