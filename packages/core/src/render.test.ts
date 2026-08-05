/**
 * The five audience projections, pinned on their exclusions.
 *
 * `docs/semantics.md` §7 is the authored table these implement, and the sharp rule is around the
 * last column: the affected-individual artefact carries **no system internals at all**, and it is a
 * derivation rather than a subset of an expert one. Both are asserted here the way the Python
 * asserts them — as an exclusion over the run's own data, so a later change that adds a leak fails
 * rather than passes.
 */

import { describe, expect, test } from "bun:test"

import "@reasonsmith/engines"
import { AUDIENCES, checkConformance, loadPack, renderText } from "./index.ts"
import { deployedCreditSystem } from "@reasonsmith/systems"

const report = checkConformance(deployedCreditSystem(), loadPack("ecoa"), {
  systemName: "credit-scoring",
})
const rendered = Object.fromEntries(
  AUDIENCES.map((audience) => [audience, renderText(report, audience)]),
) as Record<(typeof AUDIENCES)[number], string>

describe("the five audiences", () => {
  test("are the vocabulary the docs name, and a sixth is refused rather than widened", () => {
    expect([...AUDIENCES]).toEqual([
      "developer",
      "deployer",
      "auditor",
      "regulator",
      "affected-individual",
    ])
    expect(() => renderText(report, "expert" as never)).toThrow(/Unknown audience/)
  })

  test("auditor is the full report by identity: the no-flag default", () => {
    expect(renderText(report)).toBe(rendered.auditor)
  })

  test("no audience disagrees with another about a verdict", () => {
    for (const result of report.results) {
      const mark = result.verdict === "satisfied" ? "PASS" : result.verdict === "violated" ? "FAIL" : null
      if (mark === null) continue
      for (const audience of AUDIENCES) {
        expect(rendered[audience]).toContain(`${mark}  ${result.requirement_id}`)
      }
    }
  })

  test("no audience drops the limits", () => {
    for (const audience of AUDIENCES) {
      expect(rendered[audience]).toContain(report.limits.slice(0, 60))
    }
  })
})

describe("the affected-individual artefact carries no system internals", () => {
  const lay = rendered["affected-individual"]

  test("no strength vocabulary — being told a duty is probed hands a person an evidence model", () => {
    for (const rung of ["observed", "probed", "proved", "recounted", "unattainable"]) {
      expect(lay).not.toContain(`[${rung}]`)
    }
  })

  test("no evidence basis, on the flag that already withholds the strength", () => {
    expect(lay).not.toContain("basis:")
  })

  test("no signal names, no probe budget, no counterexamples", () => {
    expect(lay).not.toContain("probe budget")
    expect(lay).not.toContain("counterexample")
    expect(lay).not.toContain("requires:")
    // A capability signal name is a system internal too.
    expect(lay).not.toContain("artifact_logs_")
  })

  test("is a derivation and not a subset of an expert view", () => {
    // The Python's measurement, kept as an assertion: the lay artefact must carry content no
    // expert view does. Built out of suppression flags alone it was the developer's report with
    // parts removed, so the reader least able to fill a gap in was handed the most gaps.
    const words = (text: string) => new Set(text.toLowerCase().match(/[a-z']+/g) ?? [])
    const laid = words(lay)
    for (const expert of ["developer", "deployer", "auditor", "regulator"] as const) {
      const theirs = words(rendered[expert])
      const own = [...laid].filter((w) => !theirs.has(w))
      expect(own.length).toBeGreaterThan(0)
    }
  })

  test("never puts a heading over an empty box: silence is not a clean result", () => {
    // The section on whether the stated reasons were all the reasons is printed whatever the
    // answer, because absence of a finding reads to this reader as completeness and it is not.
    expect(lay).toContain("WHETHER THE STATED REASONS WERE ALL THE REASONS")
    expect(lay).toContain("C02 — Length of time credit has been established is too short")
  })
})

describe("the projections differ by content, not framing", () => {
  test("developer sees signal names and witnesses; regulator sees neither", () => {
    expect(rendered.developer).toContain("requires:")
    expect(rendered.regulator).not.toContain("requires:")
    expect(rendered.developer).toContain("first offending decision")
    expect(rendered.regulator).not.toContain("first offending decision")
  })

  test("deployer sees the classification and the missing capability; developer sees no classification", () => {
    expect(rendered.deployer).toContain("binding")
    expect(rendered.deployer).toContain("missing capability signals")
    expect(rendered.developer).not.toContain("· domains")
  })

  test("regulator keeps the probe budget — the bound on a probed claim is how far it reaches", () => {
    expect(rendered.regulator).toContain("probe budget")
  })
})

describe("the notice that duties went unchecked survives every projection", () => {
  test("no audience drops it — a compliance gate must not go green over unchecked duties", () => {
    // A system that declares no domain: every domain-limited duty is not applicable without being
    // checked. The run still exits as a clean one would, so the *report* has to carry what the exit
    // code cannot, in every format.
    const undeclared = {
      name: "Undeclared",
      capabilities: () => ["artifact_logs_decision_record"],
      decisions: () => [{ artifact_logs_decision_record: "a" }],
      logic: () => null,
    }
    const skipped = checkConformance(undeclared, loadPack("ecoa"), { systemName: "undeclared" })
    expect(skipped.undeclaredDomainNotice).not.toBeNull()
    for (const audience of AUDIENCES) {
      expect(renderText(skipped, audience)).toContain("without being checked")
    }
  })
})
