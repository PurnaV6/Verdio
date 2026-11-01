import { describe, expect, it } from "vitest";
import { moneyFiguresView, REPORT_LINK_LABEL, toStatusBannerView } from "./statusBannerModel";
import { TONE_GLYPH } from "./status";
import type { DatasetStatus } from "../../types/dataPipeline";

const status = (kind: DatasetStatus['status'], reasons: string[]): DatasetStatus => ({ status: kind, reasons, triggers: [] });

describe("status banner view", () => {
  it("draws nothing for a ready file", () => {
    expect(toStatusBannerView(status('ready', ['No gap in this file is large enough to limit how far its numbers can be trusted.']))).toBeNull();
  });

  it("draws nothing for a result saved before the status existed", () => {
    expect(toStatusBannerView(undefined)).toBeNull();
    expect(moneyFiguresView(undefined)).toEqual({ withheld: false, message: '', reason: null });
  });

  it("shows the status word, a glyph, every reason and the link", () => {
    const view = toStatusBannerView(status('caveats', ['A.', 'B.']))!;
    expect(view).toMatchObject({ status: 'caveats', word: 'Usable with caveats', tone: 'watch', reasons: ['A.', 'B.'], linkLabel: REPORT_LINK_LABEL });
    expect(REPORT_LINK_LABEL).toBe('See the cleaning report');
    expect(TONE_GLYPH[view.tone]).toBe('●');
  });

  it("gives each status its own word, and a shape as well as a colour", () => {
    const words = (['caveats', 'incomplete', 'not_compatible'] as const).map(kind => toStatusBannerView(status(kind, ['x']))!.word);
    expect(new Set(words).size).toBe(3);
    expect(toStatusBannerView(status('incomplete', ['x']))!.word).toBe('Incomplete');
    expect(toStatusBannerView(status('not_compatible', ['x']))!.word).toBe('Not compatible');
    expect(TONE_GLYPH[toStatusBannerView(status('not_compatible', ['x']))!.tone]).toBe('▲');
  });
});

describe("money figures on the Overview", () => {
  it("are withheld only for a file that is not compatible", () => {
    expect(moneyFiguresView(status('ready', [])).withheld).toBe(false);
    expect(moneyFiguresView(status('caveats', ['x'])).withheld).toBe(false);
    expect(moneyFiguresView(status('incomplete', ['x'])).withheld).toBe(false);
    expect(moneyFiguresView(status('not_compatible', ['x'])).withheld).toBe(true);
  });

  it("say so in the approved words and carry the most serious reason", () => {
    const view = moneyFiguresView(status('not_compatible', ['Revenue is blank on 72% of rows (52 of 72), too many for reliable sales totals.', 'Second.']));
    expect(view.message).toBe('Verd.io cannot give reliable sales figures for this file');
    expect(view.reason).toBe('Revenue is blank on 72% of rows (52 of 72), too many for reliable sales totals.');
  });
});
