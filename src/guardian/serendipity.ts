/**
 * Thin compatibility wrapper (WP-4.6).
 * Prefer `serendipity-weaver.ts` for new code.
 */
import {
  runSerendipityTurn,
  SERENDIPITY_CATALOG,
  type SerendipityEvent
} from "./serendipity-weaver.js";

/** @deprecated Use SERENDIPITY_CATALOG from serendipity-weaver */
export const SERENDIPITY_EVENTS = SERENDIPITY_CATALOG.map((e) => {
  const note = e.grokNote ? ` (Grok Note: ${e.grokNote})` : "";
  return `${e.text}${note}`;
});

/**
 * Back-compat entry used by older call sites.
 * Now routes through Serendipity 2.0 weaver (stateful, tiered).
 */
export function getSerendipityNudge(
  highRiskTriggers: string[],
  chancePercentage = 15,
  opts?: {
    userMessage?: string;
    /** Injected for tests */
    rng?: () => number;
    persist?: boolean;
  }
): string | undefined {
  // Legacy chancePercentage ignored for selection math (weaver uses drought-aware chance).
  // Kept in signature for API stability.
  void chancePercentage;
  const result = runSerendipityTurn({
    highRiskTriggers,
    userMessage: opts?.userMessage ?? "",
    rng: opts?.rng,
    persist: opts?.persist
  });
  return result.nudge;
}

export type { SerendipityEvent };
