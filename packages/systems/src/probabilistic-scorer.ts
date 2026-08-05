/**
 * A probabilistic risk scorer, replayable in-process.
 *
 * Ported from `src/reasonsmith/examples/probabilistic_scorer.py`. The middle case of the three: the
 * model is not a rule set a solver can reason over, but it *can be run*, so the duty stops being a
 * question about the decisions it happened to log. The probe perturbs those decisions and replays
 * them through `decide()`, which is the `probed` rung.
 */

import type { DecisionRecord, SystemUnderTest } from "@reasonsmith/core"

export const MODEL_VERSION = "bayes-risk-2026.04.7"

/**
 * Calibrated log-odds contribution per factor, and the ECOA reason code each one maps to. A positive
 * contribution is evidence against the applicant.
 */
export const LOG_ODDS: Record<string, readonly [number, string]> = {
  debt_to_income: [2.4, "C02 excessive obligations in relation to income"],
  delinquencies_24m: [1.1, "C04 delinquent past or present credit obligations"],
  credit_history_months: [-0.011, "C03 length of credit history"],
  credit_score: [-0.009, "C01 income insufficient for amount requested"],
}

/** Posterior probability of default above which the application is declined. */
export const THRESHOLD = 0.5

/** Applications already scored in production. The probe perturbs these and replays the results. */
export const SCORED_APPLICATIONS: readonly DecisionRecord[] = [
  {
    applicant_id: "APP-2101",
    credit_score: 715,
    debt_to_income: 0.21,
    delinquencies_24m: 0,
    credit_history_months: 96,
  },
  {
    applicant_id: "APP-2102",
    credit_score: 602,
    debt_to_income: 0.48,
    delinquencies_24m: 2,
    credit_history_months: 19,
  },
]

/** Accumulates log-odds per factor and reports the factor that dominated the outcome. */
export function predict(input: DecisionRecord, intercept = -1.8): DecisionRecord {
  const contributions: Record<string, number> = {}
  for (const [factor, [weight]] of Object.entries(LOG_ODDS)) {
    const raw = input[factor]
    contributions[factor] = weight * (typeof raw === "number" ? raw : 0)
  }
  const logOdds =
    intercept + Object.values(contributions).reduce((total, value) => total + value, 0)
  const posterior = 1 / (1 + Math.E ** -logOdds)
  const declined = posterior >= THRESHOLD

  // The principal reason is the factor that pushed hardest in the direction of the outcome; on
  // approval, the factor that pushed hardest in the applicant's favour.
  const factors = Object.keys(contributions)
  const principal = factors.reduce((best, factor) =>
    declined
      ? contributions[factor] > contributions[best]
        ? factor
        : best
      : contributions[factor] < contributions[best]
        ? factor
        : best,
  )

  return {
    ...input,
    decision: declined ? "adverse_action" : "approved",
    posterior_default: Math.round(posterior * 1e6) / 1e6,
    artifact_logs_reason_explanation: declined
      ? LOG_ODDS[principal][1]
      : `C00 no adverse factor; strongest favourable factor ${principal}`,
    provenance_model_version: MODEL_VERSION,
    scope_statements_local_vs_global: "local: log-odds attribution for this applicant only",
  }
}

/** The adapter over a callable model: a declared capability set, and a way to run it. */
export class CallableAdapter implements SystemUnderTest {
  readonly name = "CallableAdapter"
  readonly capabilityBasis = "declared" as const
  readonly systemDomains: readonly string[]

  constructor(
    private readonly model: (input: DecisionRecord) => DecisionRecord,
    private readonly declared: readonly string[],
    private readonly testInputs: readonly DecisionRecord[],
    systemDomains: readonly string[] = [],
  ) {
    this.systemDomains = systemDomains
  }

  capabilities(): readonly string[] {
    return [...this.declared]
  }

  decisions(): readonly DecisionRecord[] {
    return this.testInputs.map((input) => this.model({ ...input }))
  }

  /** A calibrated log-odds model is not a rule set; there is no formula here for a solver. */
  logic(): null {
    return null
  }

  /** The system can be run, which is what puts it on the probed rung. */
  decide(input: DecisionRecord): DecisionRecord {
    return this.model({ ...input })
  }
}

/** The system as reasonsmith sees it: a replayable model and a declared capability set. */
export function probabilisticScorer(): CallableAdapter {
  return new CallableAdapter(
    (input) => predict(input),
    [
      "applicant_id",
      "decision",
      "posterior_default",
      "artifact_logs_reason_explanation",
      "provenance_model_version",
      "scope_statements_local_vs_global",
    ],
    SCORED_APPLICATIONS,
    ["consumer-credit"],
  )
}
