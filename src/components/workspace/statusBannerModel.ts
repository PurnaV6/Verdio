import { STATUS_LABEL } from "../../lib/dataPipeline/datasetStatus";
import { CANNOT_GIVE_FIGURES } from "../../lib/story/statusStory";
import type { DatasetStatus, DatasetStatusKind } from "../../types/dataPipeline";
import type { Tone } from "./status";

/* ================================================================
   VERDIO — Status banner model (pure)
   Maps a dataset status to what the banner and the Overview show.
   No wording is made up here beyond the link label: the reasons are
   the status's own sentences. A result saved before the status
   existed has none, and then nothing is shown.
   ================================================================ */

export const REPORT_LINK_LABEL = 'See the cleaning report';

/** The tone gives the glyph (● watch, ▲ risk); the word always sits beside it. */
const TONE: Record<Exclude<DatasetStatusKind, 'ready'>, Tone> = { caveats: 'watch', incomplete: 'risk', not_compatible: 'risk' };

export interface StatusBannerView {
  status: Exclude<DatasetStatusKind, 'ready'>;
  word: string;
  tone: Tone;
  reasons: string[];
  linkLabel: string;
}

/** null for a ready file and for a result with no status: the banner is then not drawn at all. */
export function toStatusBannerView(status: DatasetStatus | undefined): StatusBannerView | null {
  if (!status || status.status === 'ready') return null;
  return { status: status.status, word: STATUS_LABEL[status.status], tone: TONE[status.status], reasons: status.reasons, linkLabel: REPORT_LINK_LABEL };
}

export interface MoneyFiguresView {
  /** True when the Overview must not show money figures as if they were reliable. */
  withheld: boolean;
  /** The sentence shown in place of a money value. */
  message: string;
  /** The status's most serious reason, shown with it. */
  reason: string | null;
}

export function moneyFiguresView(status: DatasetStatus | undefined): MoneyFiguresView {
  if (!status || status.status !== 'not_compatible') return { withheld: false, message: '', reason: null };
  return { withheld: true, message: CANNOT_GIVE_FIGURES.replace(/\.$/, ''), reason: status.reasons[0] ?? null };
}
