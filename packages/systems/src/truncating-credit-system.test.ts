/**
 * The finding this whole package exists to make visible, pinned.
 *
 * **Form completeness does not imply reason fidelity.** On decision `APP-1042` the deployed engine
 * keeps one proof of five, so the notice it generates states one reason and the other four are
 * reasons its own inference had and its answer no longer depends on. The *form* duty on 12 CFR
 * 1002.9(b)(2) — the statement is present, names the model version and the scope, and is not one of
 * the two the clause itself calls insufficient — is **satisfied**. The *content* duty on the same
 * clause — the statement indicates the principal reason(s) — is **violated**, at a rung only the
 * certificate engine can reach, from a count this tool measured rather than read from the log.
 *
 * If these two ever agree, either the certificate stopped measuring or the ladder started letting
 * something weaker answer the adequacy duty. Both are the defect this port was written to preserve
 * the refusal of, so this test failing is a finding and not a flake.
 */

import { describe, expect, test } from "bun:test"

import "@reasonsmith/engines"
import {
  CERTIFICATES_KEY,
  DELETED_REASON_COUNT,
  PROBE_BUDGET_KEY,
  certifyArtifact,
  checkConformance,
  deleted,
  live,
  loadPack,
} from "@reasonsmith/core"

import { DEPLOYED_CASES, TruncatingCreditSystem, deployedCreditSystem } from "./truncating-credit-system.ts"

const FORM_DUTY = "ecoa_reg_b_1002_9_b_2_specific_reasons"
const CONTENT_DUTY = "ecoa_reg_b_1002_9_b_2_principal_reasons_complete"

function run() {
  return checkConformance(deployedCreditSystem(), loadPack("ecoa"), {
    systemName: "credit-scoring (top-1 proof truncation, artefact exposed)",
  })
}

describe("the truncating credit system", () => {
  test("the deletion probe finds four of APP-1042's five reasons deleted", () => {
    const system = new TruncatingCreditSystem()
    const record = system.decisions().find((r) => r.decision_id === "APP-1042")
    expect(record).toBeDefined()
    const artifact = system.artifact(record as Record<string, unknown>)
    expect(artifact).not.toBeNull()

    const cert = certifyArtifact(artifact as NonNullable<typeof artifact>)
    expect(cert.verdicts).toHaveLength(5)
    expect(live(cert)).toHaveLength(1)
    expect(deleted(cert)).toHaveLength(4)
    // C01 is the highest-scoring reason, so top-1 keeps it and discards C02–C05 in score order.
    expect(live(cert)[0].label).toStartWith("C01")
    expect(deleted(cert).map((v) => v.label.slice(0, 3)).sort()).toEqual([
      "C02",
      "C03",
      "C04",
      "C05",
    ])
    // The signature the attribution must recognise: the deleted reasons are exactly the lowest
    // scoring, which is what top-k proof truncation looks like from outside.
    expect(cert.attribution).toContain("top-k proof truncation at k=1")
  })

  test("APP-1043 trips a single reason, so keeping one proof deletes nothing", () => {
    const system = new TruncatingCreditSystem()
    const record = system.decisions().find((r) => r.decision_id === "APP-1043")
    const cert = certifyArtifact(
      system.artifact(record as Record<string, unknown>) as NonNullable<
        ReturnType<TruncatingCreditSystem["artifact"]>
      >,
    )
    expect(cert.verdicts).toHaveLength(1)
    expect(deleted(cert)).toHaveLength(0)
  })

  test("the notice states only the reason the deployed engine's answer depends on", () => {
    const stated = new TruncatingCreditSystem()
      .decisions()
      .find((r) => r.decision_id === "APP-1042")?.artifact_logs_reason_explanation
    expect(stated).toBeTypeOf("string")
    expect(stated as string).toContain("C01")
    for (const code of ["C02", "C03", "C04", "C05"]) {
      expect(stated as string).not.toContain(code)
    }
  })

  test("the form duty is satisfied and the content duty is violated, on the same clause", () => {
    const report = run()
    const form = report.results.find((r) => r.requirement_id === FORM_DUTY)
    const content = report.results.find((r) => r.requirement_id === CONTENT_DUTY)

    expect(form?.verdict).toBe("satisfied")
    expect(content?.verdict).toBe("violated")
    // Same clause, opposite verdicts. That is the finding.
    expect(form?.source_clause).toBe(content?.source_clause)
  })

  test("the content duty is answered on the artifact basis, at probed, by measurement", () => {
    const content = run().results.find((r) => r.requirement_id === CONTENT_DUTY)
    // The basis is derived from the duty alone, and the artifact row does not admit `proved`.
    expect(content?.basis).toBe("artifact")
    expect(content?.strength).toBe("probed")
    // A probed result cannot be constructed without the budget that produced it.
    expect(content?.details[PROBE_BUDGET_KEY]).toBeDefined()
    const certificates = content?.details[CERTIFICATES_KEY] as Array<Record<string, unknown>>
    expect(Array.isArray(certificates)).toBe(true)
    const breached = certificates.find((c) => (c.reasons_deleted as number) > 0)
    expect(breached?.reasons_deleted).toBe(4)
    expect((breached?.missing_reasons as string[]).length).toBe(4)
  })

  test("the measured count is never read from the system's own log", () => {
    // The system declares it can expose the artefact; no record carries the number, and the engine
    // would overwrite it if one did. A system that could settle this duty by logging a zero would be
    // grading its own homework.
    for (const record of new TruncatingCreditSystem().decisions()) {
      expect(record[DELETED_REASON_COUNT]).toBeUndefined()
    }
    expect(TruncatingCreditSystem.CAPABILITIES).toContain(DELETED_REASON_COUNT)
  })

  test("the counterfactual duty is not evaluated, never satisfied, in a build with no solver", () => {
    const relational = run().results.find(
      (r) => r.requirement_id === "ecoa_reg_b_1002_4_a_no_disparate_treatment",
    )
    expect(relational?.verdict).not.toBe("satisfied")
    expect(relational?.strength).not.toBe("proved")
  })

  test("the deployed cases are the two the demonstration names", () => {
    expect(DEPLOYED_CASES.map((c) => c.caseId)).toEqual(["APP-1043", "APP-1042"])
  })
})
