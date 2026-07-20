import type { RawRow, DatasetProfile, ColumnProfile } from "../../types/dataPipeline";
import type { BusinessRole, ColumnSemantics, SemanticResult, SemanticType, EvidenceItem, SemanticIndex } from "../../types/semantic";
import { NAME_HINTS, NUMERIC_ROLES, VALUE_PATTERNS, REVIEW_THRESHOLD } from "../../config/semanticDictionary";

/* ================================================================
   VERDIO — Stage 4: Semantic Column Detection
   Classifies each column into a BusinessRole using combined evidence:
   name, value patterns, type consistency, cardinality, and range
   checks. Confidence is *computed* from that evidence, never assigned.
   Columns below REVIEW_THRESHOLD are flagged needsReview rather than
   silently assumed — the UI should surface these for confirmation.
   ================================================================ */

const ALL_ROLES = Object.keys(NAME_HINTS).filter(r => r !== 'unknown') as BusinessRole[];
const MIN_CANDIDATE_SCORE = 0.2;      // below this, a column is classified 'unknown'
const ALTERNATIVE_THRESHOLD = 0.15;   // roles scoring above this are shown as alternatives

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function nameMatchEvidence(header: string, role: BusinessRole): EvidenceItem | null {
  const norm = normaliseHeader(header);
  const hints = NAME_HINTS[role];
  const exact = hints.find(h => norm === h);
  if (exact) return { source: 'name_match', weight: 0.55, detail: `Column name "${header}" exactly matches known ${role} term "${exact}".` };
  const partial = hints.find(h => norm.includes(h));
  if (partial) return { source: 'name_match', weight: 0.4, detail: `Column name "${header}" contains known ${role} term "${partial}".` };
  return null;
}

function valuePatternEvidence(role: BusinessRole, col: ColumnProfile, sample: string[]): EvidenceItem | null {
  if (!sample.length) return null;
  const frac = (pred: (v: string) => boolean) => sample.filter(pred).length / sample.length;

  switch (role) {
    case 'date': {
      const f = frac(v => VALUE_PATTERNS.isoDateLike.test(v) || VALUE_PATTERNS.slashDateLike.test(v));
      return f >= 0.5 ? { source: 'value_pattern', weight: 0.3 * f, detail: `${Math.round(f * 100)}% of sampled values look like dates.` } : null;
    }
    case 'price': case 'cost': case 'revenue': {
      const f = frac(v => VALUE_PATTERNS.currencySymbol.test(v));
      return f > 0 ? { source: 'value_pattern', weight: 0.25 * f, detail: `${Math.round(f * 100)}% of sampled values carry a currency symbol.` } : null;
    }
    case 'percentage': {
      const f = frac(v => VALUE_PATTERNS.percentSign.test(v));
      if (f > 0) return { source: 'value_pattern', weight: 0.25 * f, detail: `${Math.round(f * 100)}% of sampled values carry a % sign.` };
      if (col.numericStats && col.numericStats.min >= 0 && col.numericStats.max <= 100) {
        return { source: 'value_pattern', weight: 0.12, detail: `Numeric range (${col.numericStats.min}–${col.numericStats.max}) is consistent with a percentage.` };
      }
      return null;
    }
    case 'customer': {
      const f = frac(v => VALUE_PATTERNS.email.test(v));
      return f >= 0.5 ? { source: 'value_pattern', weight: 0.25 * f, detail: `${Math.round(f * 100)}% of sampled values are email addresses.` } : null;
    }
    case 'location': {
      const f = frac(v => VALUE_PATTERNS.postcodeLike.test(v));
      return f >= 0.3 ? { source: 'value_pattern', weight: 0.2, detail: `Sampled values match a postcode pattern.` } : null;
    }
    case 'identifier': case 'product': {
      const f = frac(v => VALUE_PATTERNS.skuLike.test(v));
      return f >= 0.5 ? { source: 'value_pattern', weight: 0.15 * f, detail: `${Math.round(f * 100)}% of sampled values look like codes/SKUs.` } : null;
    }
    default:
      return null;
  }
}

function typeConsistencyEvidence(role: BusinessRole, col: ColumnProfile): EvidenceItem | null {
  if (NUMERIC_ROLES.includes(role)) {
    return col.inferredType === 'number'
      ? { source: 'type_consistency', weight: 0.2, detail: `Column is numeric, consistent with "${role}".` }
      : { source: 'type_consistency', weight: -0.5, detail: `Column is not numeric — inconsistent with "${role}".` };
  }
  if (role === 'date') {
    return col.inferredType === 'date'
      ? { source: 'type_consistency', weight: 0.2, detail: 'Column parses as a date.' }
      : { source: 'type_consistency', weight: -0.5, detail: 'Column does not parse as a date.' };
  }
  return null;
}

function cardinalityEvidence(role: BusinessRole, col: ColumnProfile, rowCount: number): EvidenceItem | null {
  switch (role) {
    case 'identifier':
      if (col.uniquenessRatio > 0.9) return { source: 'cardinality', weight: 0.2, detail: 'Almost every value is unique, consistent with an identifier.' };
      if (col.uniquenessRatio > 0.7) return { source: 'cardinality', weight: 0.1, detail: 'Mostly unique values.' };
      return null;
    case 'customer':
      return col.uniquenessRatio > 0.4 && col.uniquenessRatio < 0.98
        ? { source: 'cardinality', weight: 0.15, detail: 'Values repeat moderately, consistent with recurring customers.' } : null;
    case 'category': case 'status':
      return col.uniqueCount > 0 && col.uniqueCount <= 30 && col.uniquenessRatio < 0.15
        ? { source: 'cardinality', weight: 0.15, detail: `Only ${col.uniqueCount} distinct value(s) — consistent with a category.` } : null;
    case 'product':
      return col.uniquenessRatio > 0.02 && col.uniquenessRatio < 0.6
        ? { source: 'cardinality', weight: 0.1, detail: 'Moderate repetition, consistent with a product list.' } : null;
    case 'location':
      return col.uniqueCount > 0 && col.uniqueCount <= 60 && rowCount > 20
        ? { source: 'cardinality', weight: 0.1, detail: `${col.uniqueCount} distinct value(s), consistent with markets/regions.` } : null;
    default:
      return null;
  }
}

function rangeCheckEvidence(role: BusinessRole, col: ColumnProfile): EvidenceItem | null {
  if (!col.numericStats) return null;
  const { min, max } = col.numericStats;
  switch (role) {
    case 'percentage':
      return (min >= 0 && max <= 100) ? { source: 'range_check', weight: 0.1, detail: 'Numeric range fits 0–100.' } : null;
    case 'quantity':
      return min >= 0 ? { source: 'range_check', weight: 0.1, detail: 'All values are non-negative, consistent with a quantity.' } : null;
    case 'price': case 'cost': case 'revenue':
      return min >= 0 ? { source: 'range_check', weight: 0.1, detail: 'All values are non-negative, consistent with a monetary amount.' } : { source: 'range_check', weight: -0.15, detail: 'Contains negative values, unusual for this role.' };
    default:
      return null;
  }
}

function semanticTypeFor(role: BusinessRole, col: ColumnProfile): SemanticType {
  if (col.inferredType === 'empty') return 'unknown';
  if (role === 'price' || role === 'cost' || role === 'revenue') return 'currency';
  if (role === 'quantity' || role === 'inventory') return 'count';
  if (role === 'date') return 'date';
  if (role === 'percentage') return 'percentage';
  if (role === 'customer' && col.sampleValues.some(v => VALUE_PATTERNS.email.test(v))) return 'email';
  if (role === 'identifier' || (role === 'product' && col.sampleValues.some(v => VALUE_PATTERNS.skuLike.test(v)))) return 'code';
  if (role === 'category' || role === 'status' || role === 'location') return 'category_label';
  if (col.inferredType === 'boolean') return 'boolean';
  if (col.inferredType === 'string') return 'free_text';
  return 'unknown';
}

function classifyColumn(col: ColumnProfile, rowCount: number): ColumnSemantics {
  const dataType: ColumnSemantics['dataType'] = col.inferredType === 'empty' ? 'string' : col.inferredType;

  if (col.inferredType === 'empty') {
    return { columnName: col.name, dataType, semanticType: 'unknown', businessRole: 'unknown', confidence: 0, evidence: [], needsReview: true, alternatives: [] };
  }

  const scored = ALL_ROLES.map(role => {
    const evidence: EvidenceItem[] = [];
    for (const fn of [
      () => nameMatchEvidence(col.name, role),
      () => valuePatternEvidence(role, col, col.sampleValues),
      () => typeConsistencyEvidence(role, col),
      () => cardinalityEvidence(role, col, rowCount),
      () => rangeCheckEvidence(role, col),
    ]) {
      const e = fn();
      if (e) evidence.push(e);
    }
    const score = Math.min(1, Math.max(0, evidence.reduce((s, e) => s + e.weight, 0)));
    return { role, score, evidence };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const chosenRole: BusinessRole = top && top.score >= MIN_CANDIDATE_SCORE ? top.role : 'unknown';
  const confidence = chosenRole === 'unknown' ? (top?.score ?? 0) : top.score;
  const evidence = chosenRole === 'unknown' ? [] : top.evidence;

  const alternatives = scored
    .filter(s => s.role !== chosenRole && s.score >= ALTERNATIVE_THRESHOLD)
    .slice(0, 3)
    .map(s => ({ businessRole: s.role, confidence: s.score }));

  return {
    columnName:   col.name,
    dataType,
    semanticType: semanticTypeFor(chosenRole, col),
    businessRole: chosenRole,
    confidence:   Math.round(confidence * 100) / 100,
    evidence,
    needsReview:  confidence < REVIEW_THRESHOLD,
    alternatives,
  };
}

export function classifyColumns(_rows: RawRow[], profile: DatasetProfile, overrides: Partial<Record<string, BusinessRole>> = {}): SemanticResult {
  const columns = profile.columns.map(col => {
    const detected = classifyColumn(col, profile.rowCount);
    const override = overrides[col.name];
    if (!override) return detected;
    return {
      ...detected,
      semanticType: semanticTypeFor(override, col),
      businessRole: override,
      confidence: 1,
      needsReview: false,
      evidence: [{ source: 'name_match' as const, weight: 1, detail: 'Confirmed by the user during data mapping.' }],
    };
  });

  const warnings: string[] = [];
  if (!columns.some(c => c.businessRole === 'date' && c.confidence >= 0.5)) {
    warnings.push('No date column detected — trend, forecasting and seasonality analysis will be unavailable.');
  }
  if (!columns.some(c => ['revenue', 'price', 'cost'].includes(c.businessRole) && c.confidence >= 0.5)) {
    warnings.push('No monetary column detected — financial metrics will be unavailable.');
  }
  const lowConfidence = columns.filter(c => c.needsReview && c.businessRole !== 'unknown');
  if (lowConfidence.length) {
    warnings.push(`${lowConfidence.length} column(s) were classified with low confidence and may need confirmation: ${lowConfidence.map(c => c.columnName).join(', ')}.`);
  }

  return { columns, warnings };
}

export function buildSemanticIndex(result: SemanticResult): SemanticIndex {
  const byRole: SemanticIndex['byRole'] = {};
  for (const col of result.columns) {
    if (col.businessRole === 'unknown') continue;
    (byRole[col.businessRole] ||= []).push(col);
  }
  for (const role of Object.keys(byRole) as BusinessRole[]) {
    byRole[role]!.sort((a, b) => b.confidence - a.confidence);
  }
  return {
    byRole,
    get(role) { return byRole[role] || []; },
    best(role) { return byRole[role]?.[0] || null; },
  };
}
