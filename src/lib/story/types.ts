/* ================================================================
   VERDIO — Story engine types
   A story is deterministic: every sentence is filled from computed
   fields of a PipelineResult. `facts` lists every number and string
   that went into the text, with the field it came from, so the numbers
   can be verified (and so AI-written text can be gated against them).
   ================================================================ */

/** Every page that can carry a story: the sidebar pages plus the tabs inside the hubs. */
export const STORY_PAGE_IDS = [
  // sidebar pages (src/components/workspace/navigation.ts)
  'overview', 'analyses', 'forecast', 'risks', 'recs', 'execution', 'advisor', 'scenarios',
  'customers', 'seasonality', 'products', 'health', 'profile', 'connections', 'relationships',
  'governance', 'alerts',
  // Executive Workspace tab
  'revenue',
  // Execution hub tabs
  'actions', 'targets', 'outcomes', 'approvals',
  // Governance hub tabs ('quality' is also the Data Quality page)
  'evidence', 'models', 'quality', 'team', 'audit', 'trust',
] as const;

export type StoryPageId = typeof STORY_PAGE_IDS[number];

export type ConfidenceLabel = 'High' | 'Medium' | 'Low';

export interface StoryConfidence { label: ConfidenceLabel; caveat: string }

/** One number or string used in a story, and the field it was read from. */
export interface StoryFact { value: number | string; source: string }
export type StoryFacts = Record<string, StoryFact>;

export interface StoryResult {
  kind: 'story';
  pageId: StoryPageId;
  /** What happened: up to 2 sentences, 35 words. */
  happened: string;
  /** Why it likely happened: up to 2 sentences, 30 words. Only a computed driver, otherwise "This file cannot show why." */
  why: string;
  /** What to do next: 1 sentence, 25 words, starts with a verb. null when the file holds no action to point at. */
  next: string | null;
  confidence: StoryConfidence;
  /** Where this comes from: file, columns used, rows, months. */
  source: string;
  /** Extra honest sentences that sit outside the limited parts (assumptions, warnings, overflow). */
  notes: string[];
  facts: StoryFacts;
}

/** Replaces the story when the fields it needs are missing. */
export interface CannotSayResult {
  kind: 'cannotSay';
  pageId: StoryPageId;
  /** The sentence to show instead of a story. */
  reason: string;
  /** What the user can do to make the story possible. */
  fix: string;
  facts: StoryFacts;
}

export type StoryOutcome = StoryResult | CannotSayResult;

/* ── Optional page state that does not live in a PipelineResult ── */

export interface TrackedActionInput { title: string; status: 'planned' | 'in_progress' | 'complete'; dueDate: string }
export interface KpiTargetInput { label: string; current: number; target: number; unit: string; direction: 'up' | 'down' }
export interface OutcomeInput { decision: string; expected: number; actual: string }
export interface ApprovalInput { decision: string; state: 'pending' | 'approved' | 'declined' }
export interface AlertPreferencesInput {
  revenueDropAlert: boolean; healthAlert: boolean; qualityAlert: boolean;
  healthThreshold: number; qualityThreshold: number; reportCadence: 'off' | 'weekly' | 'monthly';
}
export interface ScenarioLeversInput { price: number; volume: number; cost: number; retention: number }

/**
 * Things the pages keep in their own state. Anything left out falls back to the same
 * defaults the pages start with, so a story can be built from a PipelineResult alone.
 */
export interface StoryInputs {
  /** Forecast scenario toggle on the Predictions page. */
  forecastScenario?: 'base' | 'optimistic' | 'conservative';
  /** Scenario Planning sliders, in percent. */
  scenarioLevers?: ScenarioLeversInput;
  /** Execution hub records. */
  actions?: TrackedActionInput[];
  targets?: KpiTargetInput[];
  outcomes?: OutcomeInput[];
  approvals?: ApprovalInput[];
  /** Alerts & Reports settings. */
  alertPreferences?: AlertPreferencesInput;
  /** Counts from the organisation account (Governance, Team and Audit). */
  teamMembers?: number;
  auditEvents?: number;
  /** Today, for overdue counts. Defaults to now. */
  today?: Date;
}
