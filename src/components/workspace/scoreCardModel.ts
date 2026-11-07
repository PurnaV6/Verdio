import { headlineHealth, headlineQuality, type Headline } from "../../lib/dataPipeline/headlineScores";
import type { PipelineResult } from "../../types/pipeline";
import { healthReading, type Tone } from "./status";

/* ================================================================
   VERDIO — Score card model (pure)
   What the sidebar, the Overview tiles and Governance show for the
   Health and Data quality headlines. The numbers come from
   headlineHealth and headlineQuality, so they follow the dataset
   status. A result saved before the status existed shows the real
   numbers, as it always did.
   ================================================================ */

export interface ScoreView {
  /** "94", or "n/a" when no score is shown. */
  text: string;
  /** True when "/ 100" belongs after the text. */
  hasScale: boolean;
  /** 0 to 100 for a bar; 0 when there is no score. */
  barPct: number;
  /** The word and tone shown beside the score: the reason it is limited, or the health reading. */
  mark: { tone: Tone; label: string } | null;
  /** The reason the score is limited, or null when it is the real number. */
  limited: string | null;
  /** The score as uploaded, shown in the Data Hub report. */
  asUploaded: number;
}

function view(shown: Headline, reading: { tone: Tone; label: string } | null): ScoreView {
  const limited = shown.label;
  const mark = limited ? { tone: (shown.value === null ? 'risk' : 'watch') as Tone, label: limited } : reading;
  return { text: shown.text, hasScale: shown.value !== null, barPct: shown.value ?? 0, mark, limited, asUploaded: shown.asUploaded };
}

export function healthScoreView(result: Pick<PipelineResult, 'decision' | 'datasetStatus'>): ScoreView {
  const shown = headlineHealth(result);
  return view(shown, shown.value === null ? null : healthReading(shown.value));
}

export function qualityScoreView(result: Pick<PipelineResult, 'quality' | 'datasetStatus'>): ScoreView {
  return view(headlineQuality(result), null);
}

/** "94 / 100" or "n/a". */
export function scoreText(score: ScoreView): string {
  return score.hasScale ? `${score.text} / 100` : score.text;
}
