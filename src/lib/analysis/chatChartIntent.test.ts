import { beforeAll, describe, expect, it } from "vitest";
import type { PipelineResult } from "../../types/pipeline";
import { demoResult } from "../story/testkit";
import { canRing } from "../../components/charts/kit/ring";
import { specShares } from "../../components/charts/specShares";
import { localAnalysisFallback } from "./chatChartIntent";

let demo: PipelineResult;
beforeAll(async () => { demo = await demoResult(); });

describe('localAnalysisFallback for a question about how a whole splits', () => {
  it('answers a category split with the concentration analysis, which draws as a ring', () => {
    const answer = localAnalysisFallback('How do sales split by category?', demo);
    expect(answer.charts).toHaveLength(1);
    expect(answer.charts[0].chartType).toBe('pie');
    const shares = specShares(answer.charts[0])!;
    expect(canRing(shares.items)).toBe(true);
    expect(shares.items.length).toBeLessThanOrEqual(6);
  });

  it('answers a customer-segment question with the segment counts, which also draw as a ring', () => {
    const answer = localAnalysisFallback('Show the customer segment breakdown', demo);
    const shares = specShares(answer.charts[0])!;
    expect(shares.items.reduce((s, i) => s + i.value, 0)).toBe(demo.ml.segmentation!.segments.length);
    expect(canRing(shares.items)).toBe(true);
  });

  it('leaves the other answers as they were', () => {
    expect(localAnalysisFallback('What is the biggest risk?', demo).charts).toEqual([]);
    expect(localAnalysisFallback('hello', demo).charts).toEqual([demo.analyses[0].chart]);
  });
});
