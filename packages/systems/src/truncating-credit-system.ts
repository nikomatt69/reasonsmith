/**
 * The demonstration's own adverse-action pipeline, as a system `reasonsmith check` can read.
 *
 * Ported from the `TruncatingCreditSystem` half of `src/reasonsmith/demo.py`. It exists because the
 * two halves of the package used to meet only here, and disagreed: the evidence record for
 * `APP-1042` is COMPLETE while its reason-deletion certificate is FAIL, so a conformance run
 * reported the reason-giving duty satisfied on a decision the same module proves has four reasons
 * missing. **Form completeness does not imply reason fidelity**, and this system is that decision
 * handed to the report.
 *
 * It exposes `artifact(decision)` — the optional hook of the system protocol — returning the ground
 * program, base interpretation, query and engine each decision came from, so reasonsmith can
 * enumerate the reasons exactly and switch each one off itself. It does **not** log a completeness
 * figure: a system that could settle the adequacy duty by writing a zero into its own record would
 * be grading its own homework, which is the substitution that duty refuses.
 */

import type { DecisionRecord, Fact, SystemUnderTest } from "@reasonsmith/core"
import {
  type Adapter,
  type GroundProgram,
  GroundProgramArtifact,
  type Rule,
  atom,
  keyOf,
  proofScore,
  proofSupports,
  topKAdapter,
} from "./ground-program.ts"

/** (reason code, the reason as it would be stated to the person, the EDB evidence facts). */
export const CREDIT_REASONS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ["C01", "Income insufficient for amount of credit requested", ["dti_above_policy", "income_verified"]],
  ["C02", "Length of time credit has been established is too short", ["history_under_24_months", "file_thin"]],
  ["C03", "Delinquent past or present credit obligations", ["delinquency_on_file", "bureau_record_matched"]],
  ["C04", "Too many recent inquiries on credit bureau report", ["inquiries_over_policy", "bureau_record_matched"]],
  ["C05", "Insufficient number of credit references provided", ["references_under_policy", "application_complete"]],
]

export const CREDIT_QUERY = "adverse_action"

export interface Case {
  readonly caseId: string
  readonly query: Fact
  readonly program: GroundProgram
  readonly base: ReadonlyMap<Fact, number>
  readonly labels: ReadonlyMap<string, string>
}

/**
 * One decision: a ground program whose every proof is one reason, and a base interpretation.
 *
 * Fact probabilities decrease with the reason's position and with the fact's position inside it, so
 * reason scores are distinct and the score order is C01 > C02 > … — which is what makes a top-k
 * engine's discard set predictable enough to attribute.
 */
export function buildCase(
  caseId: string,
  queryPredicate: string,
  reasons: ReadonlyArray<readonly [string, string, readonly string[]]>,
  level: number,
): Case {
  const query = atom(queryPredicate, caseId)
  const rules: Rule[] = []
  const base = new Map<Fact, number>()
  const labels = new Map<string, string>()
  reasons.forEach(([code, text, facts], j) => {
    const atoms = facts.map((f) => atom(f, caseId))
    rules.push({ head: query, body: atoms })
    atoms.forEach((a, i) => {
      if (!base.has(a)) base.set(a, round(level - 0.04 * j - 0.01 * i, 4))
    })
    labels.set(keyOf(atoms), `${code} — ${text}`)
  })
  return { caseId, query, program: { rules }, base, labels }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * The decisions the deployed top-1 engine made, in the order its log holds them. `APP-1043` trips a
 * single reason, so keeping one proof keeps all of them and nothing is deleted; `APP-1042` is the
 * demonstration's own case and trips five.
 */
export const DEPLOYED_CASES: readonly Case[] = [
  buildCase("APP-1043", CREDIT_QUERY, CREDIT_REASONS.slice(0, 1), 0.8),
  buildCase("APP-1042", CREDIT_QUERY, CREDIT_REASONS, 0.88),
]

/** The engine actually deployed behind those decisions: it keeps the single best proof. */
export const DEPLOYED_ENGINE: Adapter = topKAdapter(1)

/** The reasons the deployed engine's answer depends on — what a notice generated from it would say. */
function statedReasons(caseData: Case, adapter: Adapter): string {
  const supports = proofSupports(caseData.program, caseData.query, 1)
  const engineValue = adapter.infer(caseData.program, caseData.base, caseData.query)
  const live: string[] = []
  for (const support of supports) {
    // A reason is stated when switching one of its own facts off moves the engine's answer — the
    // same one-directional probe the certificate makes, asked here by the *system* about itself.
    const owned = [...support].filter(
      (fact) => supports.filter((s) => s.has(fact)).length === 1,
    )
    const moved = owned.some((fact) => {
      const base = new Map(caseData.base)
      base.set(fact, 0)
      return Math.abs(engineValue - adapter.infer(caseData.program, base, caseData.query)) > 1e-9
    })
    if (moved) live.push(caseData.labels.get(keyOf(support)) ?? [...support].sort().join(" ∧ "))
  }
  return live.sort().join("; ")
}

export class TruncatingCreditSystem implements SystemUnderTest {
  readonly name = "TruncatingCreditSystem"

  /**
   * What this pipeline emits. `artifact_logs_deleted_reason_count` is declared because the artefact
   * is exposed, not because any record carries the number.
   */
  static readonly CAPABILITIES: readonly string[] = [
    "decision_id",
    "artifact_logs_decision_record",
    "artifact_logs_reason_explanation",
    "artifact_logs_notification_latency_days",
    "artifact_logs_counteroffer_not_accepted",
    "artifact_logs_deleted_reason_count",
    "provenance_model_version",
    "scope_statements_local_vs_global",
  ]

  readonly systemDomains = ["consumer-credit"] as const

  capabilities(): readonly string[] {
    return [...TruncatingCreditSystem.CAPABILITIES]
  }

  decisions(): readonly DecisionRecord[] {
    return DEPLOYED_CASES.map((caseData) => ({
      decision_id: caseData.caseId,
      artifact_logs_decision_record: `adverse action on ${caseData.caseId}`,
      artifact_logs_reason_explanation: statedReasons(caseData, DEPLOYED_ENGINE),
      artifact_logs_notification_latency_days: 12,
      artifact_logs_counteroffer_not_accepted: 0,
      provenance_model_version: "credit-scoring-2026.03.1 / rules cs-rules-2026.03",
      scope_statements_local_vs_global: "local: reasons for this application only",
    }))
  }

  /** No rule set to reason over: the deployed engine is proof search over a ground program. */
  logic(): null {
    return null
  }

  /** The inference this decision came from. */
  artifact(decision: DecisionRecord): GroundProgramArtifact | null {
    const caseData = DEPLOYED_CASES.find((c) => c.caseId === decision.decision_id)
    if (!caseData) return null
    return new GroundProgramArtifact({
      program: caseData.program,
      base: caseData.base,
      query: caseData.query,
      adapter: DEPLOYED_ENGINE,
      exactDepth: 1,
      labels: caseData.labels,
      // Top-k proof truncation discards proofs; it never withdraws a reason on the strength of a
      // fact arriving, so adding a fact cannot lower this engine's answer. Declared rather than
      // inferred: a defeasible engine and this one produce the same probe and the same count.
      monotone: true,
    })
  }
}

/** The system under test for `reasonsmith check --system truncating-credit`. */
export function deployedCreditSystem(): TruncatingCreditSystem {
  return new TruncatingCreditSystem()
}

export { proofScore }
