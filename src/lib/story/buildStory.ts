import type { PipelineResult } from "../../types/pipeline";
import { UNRELIABLE_FIX, UNRELIABLE_REASON, makeCtx } from "./context";
import { advisorStory, analysesStory, forecastStory, overviewStory, recsStory, revenueStory, risksStory } from "./pages/core";
import { alertsStory, connectionsStory, profileStory, qualityStory, relationshipsStory } from "./pages/data";
import { customersStory, healthStory, productsStory, scenariosStory, seasonalityStory } from "./pages/explore";
import { evidenceStory, executionStory, modelsStory, organisationCountStory, trustStory } from "./pages/operations";
import type { StoryInputs, StoryOutcome, StoryPageId } from "./types";

/* ================================================================
   VERDIO — buildStory
   Turns a computed PipelineResult into the plain-English story block
   for one page. Pure and deterministic: the same result and inputs
   always give the same text, and no page fills a number from anywhere
   but a recorded field.
   ================================================================ */

export function buildStory(pageId: StoryPageId, result: PipelineResult, inputs: StoryInputs = {}): StoryOutcome {
  try {
    const c = makeCtx(result, inputs);
    switch (pageId) {
      case 'overview': return overviewStory(c);
      case 'revenue': return revenueStory(c);
      case 'analyses': return analysesStory(c);
      case 'forecast': return forecastStory(c);
      case 'risks': return risksStory(c);
      case 'recs': return recsStory(c);
      case 'advisor': return advisorStory(c);
      case 'scenarios': return scenariosStory(c);
      case 'customers': return customersStory(c);
      case 'seasonality': return seasonalityStory(c);
      case 'products': return productsStory(c);
      case 'health': return healthStory(c);
      case 'profile': return profileStory(c);
      case 'quality': return qualityStory(c, 'quality');
      case 'connections': return connectionsStory(c);
      case 'relationships': return relationshipsStory(c);
      case 'alerts': return alertsStory(c);
      case 'execution':
      case 'actions':
      case 'targets':
      case 'outcomes':
      case 'approvals':
        return executionStory(c, pageId);
      case 'governance':
      case 'evidence':
        return evidenceStory(c, pageId);
      case 'models': return modelsStory(c);
      case 'team':
      case 'audit':
        return organisationCountStory(c, pageId);
      case 'trust': return trustStory(c);
    }
  } catch {
    // A story must never break the page it sits on: fall through to the honest fallback.
  }
  return { kind: 'cannotSay', pageId, reason: UNRELIABLE_REASON, fix: UNRELIABLE_FIX, facts: {} };
}
