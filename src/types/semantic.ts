/* ================================================================
   VERDIO — Semantic Column Detection Types
   ================================================================ */

export type BusinessRole =
  | 'date' | 'identifier' | 'product' | 'customer' | 'category'
  | 'quantity' | 'price' | 'cost' | 'revenue' | 'percentage'
  | 'location' | 'employee' | 'inventory' | 'duration' | 'status'
  | 'unknown';

export type SemanticType =
  | 'currency' | 'count' | 'date' | 'percentage' | 'email'
  | 'code' | 'category_label' | 'free_text' | 'boolean' | 'unknown';

export interface EvidenceItem {
  source: 'name_match' | 'value_pattern' | 'type_consistency' | 'cardinality' | 'range_check';
  detail: string;
  weight: number;   // contribution to final confidence, 0–1
}

export interface ColumnSemantics {
  columnName:    string;
  dataType:      'number' | 'date' | 'boolean' | 'string';
  semanticType:  SemanticType;
  businessRole:  BusinessRole;
  confidence:    number;            // 0–1, derived from evidence — never hardcoded
  evidence:      EvidenceItem[];
  needsReview:   boolean;           // true when confidence < REVIEW_THRESHOLD
  // Alternative candidates considered, for transparency / user override UI
  alternatives:  { businessRole: BusinessRole; confidence: number }[];
}

export interface SemanticResult {
  columns:  ColumnSemantics[];
  warnings: string[];   // e.g. "No date column detected — time-based analysis will be unavailable"
}

/* Convenience lookup built by the caller after semanticEngine runs */
export interface SemanticIndex {
  byRole: Partial<Record<BusinessRole, ColumnSemantics[]>>;
  get(role: BusinessRole): ColumnSemantics[];
  best(role: BusinessRole): ColumnSemantics | null;   // highest-confidence column for a role
}
