/* ================================================================
   VERDIO — Feature Engineering Types (Stage 7)
   ================================================================ */

export type EngineeredValue = string | number;
export type EngineeredRow = Record<string, EngineeredValue>;

export type FeatureKind = 'date_part' | 'total' | 'ratio' | 'band' | 'difference';

export interface FeatureDefinition {
  name:          string;       // the column key added to every row, e.g. "__monthKey"
  kind:          FeatureKind;
  sourceColumns: string[];     // original columns this was derived from
  description:   string;       // human-readable, shown in a "what Verdio computed" panel
}

export interface EngineeredDataset {
  rows:          EngineeredRow[];
  addedFeatures: FeatureDefinition[];
}
