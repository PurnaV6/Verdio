import type { PipelineResult } from "../../types/pipeline";

/* ================================================================
   VERDIO — Headline scores (pure)
   The Health and Data quality numbers shown on the sidebar, the
   Overview tiles, Governance and in the story facts follow the
   dataset status, so a headline never says "94 / 100" about a file
   the status calls incomplete or not compatible. Nothing here changes
   the stored score: result.quality and result.decision.health keep
   the real numbers, and the Data Hub report still shows them.

     ready, caveats   the real number
     incomplete       quality capped at 60, labelled "Limited by missing data"
                      (health keeps its number and carries the same label)
     not_compatible   no number ("n/a"), labelled "Not reliable for this file"
     no status        the real number (a result saved before the status existed)
   ================================================================ */

export const QUALITY_CAP_WHEN_INCOMPLETE = 60;
export const LIMITED_LABEL = 'Limited by missing data';
export const UNRELIABLE_LABEL = 'Not reliable for this file';
export const NO_SCORE_TEXT = 'n/a';

export interface Headline {
  /** The number to show, or null when none should be shown. */
  value: number | null;
  /** value as text, or "n/a". */
  text: string;
  /** The reason the headline is limited, or null when it is the real number. */
  label: string | null;
  /** The score as computed, whatever the status. */
  asUploaded: number;
}

type WithStatus = Pick<PipelineResult, 'datasetStatus'>;

function headline(real: number, status: WithStatus['datasetStatus'], capAt?: number): Headline {
  switch (status?.status) {
    case 'not_compatible':
      return { value: null, text: NO_SCORE_TEXT, label: UNRELIABLE_LABEL, asUploaded: real };
    case 'incomplete': {
      const value = capAt === undefined ? real : Math.min(real, capAt);
      return { value, text: String(value), label: LIMITED_LABEL, asUploaded: real };
    }
    default:
      return { value: real, text: String(real), label: null, asUploaded: real };
  }
}

export function headlineQuality(result: WithStatus & Pick<PipelineResult, 'quality'>): Headline {
  return headline(result.quality.overallScore, result.datasetStatus, QUALITY_CAP_WHEN_INCOMPLETE);
}

export function headlineHealth(result: WithStatus & Pick<PipelineResult, 'decision'>): Headline {
  return headline(result.decision.health.total, result.datasetStatus);
}
