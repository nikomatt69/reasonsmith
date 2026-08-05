/**
 * A neural credit scorer, audited from the only thing it exposes: its decision log.
 *
 * Ported from `src/reasonsmith/examples/neural_scorer.py`. This is the black box. A risk network is
 * served behind an inference API; the audit runs on a separate host, against the decision log the
 * serving stack exported. Nothing else crosses the boundary.
 *
 * What a reader must not break:
 *   - **This system exposes `decisions()` and nothing else, and that is the point, not an omission
 *     to be fixed.** There is no `decide()` because the served model is not reachable from the audit
 *     host, and no `logic()` because a weight matrix is not a rule set: there is no formula in it for
 *     a solver to reason over. The ladder reads exactly that surface, so the strongest evidence
 *     available here is `observed` — read off the trace supplied, claiming nothing about the
 *     decisions not in it. A future edit that handed this adapter a replay hook would raise the rung
 *     and the demonstration would stop being the honest one it is sold as.
 *   - `declaredCapabilities` is passed, so the capability basis stays `"declared"` — the vendor's
 *     data sheet states which signals the serving stack emits. Dropping it would make the adapter
 *     derive the set from this one sample trace, and an unattainable finding would then be worded as
 *     a claim about the system rather than about the log.
 */

import type { DecisionRecord, SystemUnderTest } from "@reasonsmith/core"

/** The signals the vendor's data sheet says the serving stack writes for every scored application. */
export const DECLARED_CAPABILITIES: readonly string[] = [
  "applicant_id",
  "decision",
  "artifact_logs_reason_explanation",
  "provenance_model_version",
  "scope_statements_local_vs_global",
]

/**
 * Decision log exported from the inference service, one JSON object per scored application. The
 * network that produced it is not in this file and cannot be called from here; this is what an
 * auditor of a hosted model actually holds.
 */
export const EXPORTED_LOG = [
  '{"applicant_id": "APP-1042", "decision": "adverse_action",' +
    ' "artifact_logs_reason_explanation": "C01 income insufficient for amount requested",' +
    ' "provenance_model_version": "risk-net-2026.06.2",' +
    ' "scope_statements_local_vs_global": "local: attribution for this applicant only"}',
  '{"applicant_id": "APP-1043", "decision": "approved",' +
    ' "artifact_logs_reason_explanation": "C00 no adverse factor",' +
    ' "provenance_model_version": "risk-net-2026.06.2",' +
    ' "scope_statements_local_vs_global": "local: attribution for this applicant only"}',
  '{"applicant_id": "APP-1044", "decision": "adverse_action",' +
    ' "artifact_logs_reason_explanation": "C03 length of credit history",' +
    ' "provenance_model_version": "risk-net-2026.06.2",' +
    ' "scope_statements_local_vs_global": "local: attribution for this applicant only"}',
].join("\n")

/**
 * The adapter over an exported JSONL log. The counterpart of Python's `JSONLAdapter`: a log and a
 * declared capability set, and no way to run the system.
 */
export class JSONLAdapter implements SystemUnderTest {
  readonly name = "JSONLAdapter"
  readonly capabilityBasis: "declared" | "trace"
  readonly systemDomains: readonly string[]
  private readonly records: DecisionRecord[]
  private readonly declared: readonly string[] | null

  constructor(
    jsonl: string,
    options: { declaredCapabilities?: readonly string[]; systemDomains?: readonly string[] } = {},
  ) {
    this.records = jsonl
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => JSON.parse(line) as DecisionRecord)
    this.declared = options.declaredCapabilities ?? null
    this.capabilityBasis = this.declared === null ? "trace" : "declared"
    this.systemDomains = options.systemDomains ?? []
  }

  capabilities(): readonly string[] {
    if (this.declared !== null) return [...this.declared]
    // Derived from the trace, which is a weaker claim, and `capabilityBasis` says so: a longer trace
    // could carry a signal this one does not.
    return [...new Set(this.records.flatMap((rec) => Object.keys(rec)))].sort()
  }

  decisions(): readonly DecisionRecord[] {
    return this.records.map((rec) => ({ ...rec }))
  }

  /** A weight matrix is not a rule set: there is no formula in it for a solver to reason over. */
  logic(): null {
    return null
  }
}

/** The system as reasonsmith sees it: an exported log and a declared capability set. */
export function neuralScorer(): JSONLAdapter {
  return new JSONLAdapter(EXPORTED_LOG, {
    declaredCapabilities: DECLARED_CAPABILITIES,
    // Not inferred by reasonsmith from anything: an undeclared system is never reported satisfied on
    // a domain-limited duty, so the declaration is what puts this system within the duty's reach.
    systemDomains: ["consumer-credit"],
  })
}
