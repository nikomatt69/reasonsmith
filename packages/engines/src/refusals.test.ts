/**
 * The refusals every rung shares — pinned, because each one is a place a weaker build would have
 * printed a clean verdict instead.
 *
 * An empty trace, a trigger that fired nowhere, and a `contains()` atom over something that is not a
 * statement. None of the three is a violation and none is a satisfaction: each is *not evaluated*,
 * which is this package's way of saying the engine ran and learned nothing.
 */

import { describe, expect, test } from "bun:test"

import {
  Pack,
  Requirement,
  type SystemUnderTest,
  VACUOUS_TRIGGER_KEY,
  checkConformance,
} from "@reasonsmith/core"
import "./index.ts"

const duty = (over: Partial<ConstructorParameters<typeof Requirement>[0]> = {}) =>
  new Requirement({
    id: "d",
    source_document: "Doc",
    article_clause: "1",
    verbatim_text: "text",
    stakeholder: "s",
    formalism: "record",
    spec: "present(artifact_logs_decision_record)",
    rationale: "why",
    requires: ["artifact_logs_decision_record"],
    binding: true,
    scope: "",
    domains: [],
    deontic_type: "obligation",
    defeasibility: "strict",
    ...over,
  })

function system(records: readonly Record<string, unknown>[], declared: readonly string[]): SystemUnderTest {
  return {
    name: "Stub",
    capabilities: () => [...declared],
    decisions: () => records.map((r) => ({ ...r })),
    logic: () => null,
  }
}

const runOne = (req: Requirement, sut: SystemUnderTest) =>
  checkConformance(sut, new Pack({ id: "p", title: "t", description: "d", requirements: [req] }))
    .results[0]

describe("an empty trace is never evidence", () => {
  test("the record engine reports not evaluated, not satisfied", () => {
    const result = runOne(duty(), system([], ["artifact_logs_decision_record"]))
    expect(result.verdict).toBe("inconclusive")
    expect(result.strength).toBeNull()
    expect(result.evidence_summary).toContain("empty")
  })

  test("the observed engine reports not evaluated, and says why the vacuous truth is not a verdict", () => {
    const result = runOne(
      duty({
        formalism: "temporal",
        spec: "always(present(artifact_logs_decision_record))",
      }),
      system([], ["artifact_logs_decision_record"]),
    )
    expect(result.verdict).toBe("inconclusive")
    expect(result.strength).toBeNull()
    expect(result.evidence_summary).toContain("top of the lattice")
  })
})

describe("a trigger that fired nowhere", () => {
  test("is not evaluated, naming the antecedent and the domain", () => {
    const result = runOne(
      duty({
        formalism: "logical",
        spec: "present(artifact_logs_reason_explanation) -> present(provenance_model_version)",
        requires: ["artifact_logs_reason_explanation", "provenance_model_version"],
      }),
      // The antecedent signal is declared but blank in every record: the duty reaches the system and
      // its trigger never fires. An implication holds wherever its trigger is false, so reporting
      // satisfied here would report every system alike clean.
      system(
        [{ artifact_logs_reason_explanation: "", provenance_model_version: "v1" }],
        ["artifact_logs_reason_explanation", "provenance_model_version"],
      ),
    )
    expect(result.verdict).toBe("inconclusive")
    expect(result.strength).toBeNull()
    const vacuous = result.details[VACUOUS_TRIGGER_KEY] as Record<string, string>
    expect(vacuous.antecedent).toContain("present(artifact_logs_reason_explanation)")
    expect(vacuous.domain).toContain("decision(s) of the trace")
  })

  test("but a trigger that did fire is answered normally", () => {
    const result = runOne(
      duty({
        formalism: "logical",
        spec: "present(artifact_logs_reason_explanation) -> present(provenance_model_version)",
        requires: ["artifact_logs_reason_explanation", "provenance_model_version"],
      }),
      system(
        [{ artifact_logs_reason_explanation: "C01 stated", provenance_model_version: "v1" }],
        ["artifact_logs_reason_explanation", "provenance_model_version"],
      ),
    )
    expect(result.verdict).toBe("satisfied")
    expect(result.strength).toBe("observed")
  })
})

describe("the record engine names which signal failed in which record", () => {
  test("a missing value in an observed record is an observed violation", () => {
    const result = runOne(
      duty({ spec: "present(artifact_logs_decision_record)" }),
      system(
        [{ artifact_logs_decision_record: "a" }, { artifact_logs_decision_record: "" }],
        ["artifact_logs_decision_record"],
      ),
    )
    expect(result.verdict).toBe("violated")
    expect(result.strength).toBe("observed")
    expect(result.details.signals_absent_from_trace).toEqual(["artifact_logs_decision_record"])
    expect(result.details.violation_step_indices).toEqual([1])
  })
})

describe("a temporal violation names a record only where there is one to name", () => {
  const trace = [
    { artifact_logs_decision_record: "a", artifact_logs_incompleteness_notice_sent: "" },
    { artifact_logs_decision_record: "", artifact_logs_incompleteness_notice_sent: "" },
  ]

  test("always(f) names the position where f actually failed, not position 0", () => {
    const result = runOne(
      duty({
        formalism: "temporal",
        spec: "always(present(artifact_logs_decision_record))",
      }),
      system(trace, ["artifact_logs_decision_record"]),
    )
    expect(result.verdict).toBe("violated")
    // The breach is at #1. Reporting #0 — where the *formula* was evaluated — would hand a reader a
    // record that is perfectly compliant.
    expect(result.details.violation_step_indices).toEqual([1])
    expect(result.evidence_summary).toContain("decision #1")
  })

  test("a shape with no per-record breach offers no offending record at all", () => {
    const result = runOne(
      duty({
        formalism: "temporal",
        spec: "eventually(present(artifact_logs_incompleteness_notice_sent))",
        requires: ["artifact_logs_incompleteness_notice_sent"],
      }),
      system(trace, ["artifact_logs_incompleteness_notice_sent"]),
    )
    expect(result.verdict).toBe("violated")
    expect(result.details.offending_trace_segment).toBeUndefined()
    expect(result.evidence_summary).toContain("no single breaching decision to name")
  })
})
