/* ================================================================
   VERDIO — Decision Engine Types (Stage 11)
   ================================================================ */

export interface HealthPillar { name: string; score: number; max: number; color: string }
export interface HealthScore {
  breakdown: Record<string, never>; total: number; pillars: HealthPillar[]
}

export type RiskLevel = 'high' | 'medium' | 'low';

export interface Risk {
  impact: any;
  level: RiskLevel;
  icon:  string;
  title: string;
  desc:  string;      // FDIF-generated fallback text; AI may enrich this in the UI layer
  sourceColumns: string[];
}

export type RecImpact = 'high' | 'medium';

export interface Recommendation {
  effort: any;
  title: string;
  desc:  string;
  impact: RecImpact;
  sourceColumns: string[];
}

export interface DecisionResult {
  health: HealthScore;
  risks:  Risk[];
  recommendations: Recommendation[];
}
