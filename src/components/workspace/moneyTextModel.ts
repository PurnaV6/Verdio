import { UNRELIABLE_LABEL } from "../../lib/dataPipeline/headlineScores";
import type { DatasetStatus } from "../../types/dataPipeline";

/* ================================================================
   VERDIO — Money text for a file that is not compatible (pure)
   A file the dataset status calls not compatible has no reliable
   sales figures, so text that quotes a pound estimate shows
   "Not reliable for this file" in place of the figure and keeps the
   action wording. Any other status, and a result saved before the
   status existed, is left exactly as it was.
   ================================================================ */

export const NOT_RELIABLE_FIGURE = UNRELIABLE_LABEL;

export function isMoneyWithheld(status: DatasetStatus | undefined): boolean {
  return status?.status === 'not_compatible';
}

/** A pound sign, a number with thousands separators, or a whole number of five or more digits (a year is not a figure). */
const MONEY_FIGURE = /£\s?\d|\d{1,3}(?:,\d{3})+|\b\d{5,}\b/;

export function hasMoneyFigure(text: string): boolean {
  return MONEY_FIGURE.test(text);
}

/** The text, or "Not reliable for this file." when the file is not compatible and the text quotes a money figure. */
export function guardMoneyText(status: DatasetStatus | undefined, text: string): string {
  return isMoneyWithheld(status) && hasMoneyFigure(text) ? `${NOT_RELIABLE_FIGURE}.` : text;
}

/** "£1,200" or "Not reliable for this file". */
export function guardPounds(status: DatasetStatus | undefined, value: number, show: (value: number) => string = amount => `£${amount.toLocaleString('en-GB')}`): string {
  return isMoneyWithheld(status) ? NOT_RELIABLE_FIGURE : show(value);
}
