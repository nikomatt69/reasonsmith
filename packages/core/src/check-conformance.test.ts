/**
 * The gates, the unattainable analysis and the ladder — pinned on the guarantees, not the wording.
 *
 * The one that matters most is the first: `analyzeUnattainable` must decide from declared
 * capabilities alone, and a run that needed no trace must never have executed the system. Every
 * other promise in this package is worth less if that one is only true by accident of ordering.
 */

import { describe, expect, test } from "bun:test"

import {
  type DecisionRecord,
  Pack,
  Requirement,
  RequirementResult,
  type SystemUnderTest,
  analyzeUnattainable,
  checkConformance,
  evidenceBasis,
  loadPack,
  registerEngines,
  sourceClause,
} from "./index.ts"

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

class Spy implements SystemUnderTest {
  readonly name = "Spy"
  decisionsCalled = 0
  constructor(
    private readonly declared: readonly string[],
    private readonly records: readonly DecisionRecord[] = [],
    readonly systemDomains: readonly string[] = [],
  ) {}
  capabilities() {
    return [...this.declared]
  }
  decisions() {
    this.decisionsCalled += 1
    return this.records
  }
  logic() {
    return null
  }
}

describe("the unattainable analysis", () => {
  test("decides from declared capabilities alone and never executes the system", () => {
    const sut = new Spy([])
    const { unattainable, missing } = analyzeUnattainable(duty(), sut)
    expect(unattainable).toBe(true)
    expect(missing).toEqual(["artifact_logs_decision_record"])
    expect(sut.decisionsCalled).toBe(0)
  })

  test("a whole run over an unattainable pack never reads the trace", () => {
    const sut = new Spy([])
    const pack = new Pack({ id: "p", title: "t", description: "d", requirements: [duty()] })
    const report = checkConformance(sut, pack)
    expect(sut.decisionsCalled).toBe(0)
    expect(report.results[0].strength).toBe("unattainable")
    // An unattainable result is inconclusive: never satisfied, never violated.
    expect(report.results[0].verdict).toBe("inconclusive")
  })

  test("a build with no engines reports not evaluated, and still runs nothing", () => {
    // `@reasonsmith/core` installs no engines. That is the honest answer for a build that has none:
    // the ladder is empty, every duty is not evaluated, and nothing is substituted for the missing
    // rung. It is also why this file can pin the resource discipline without depending on engines.
    const sut = new Spy(["artifact_logs_decision_record"], [{ artifact_logs_decision_record: "a" }])
    const pack = new Pack({ id: "p", title: "t", description: "d", requirements: [duty()] })
    const report = checkConformance(sut, pack)
    expect(report.results[0].strength).toBeNull()
    expect(report.results[0].verdict).toBe("inconclusive")
    expect(sut.decisionsCalled).toBe(0)
  })

  test("the trace is read at most once across a whole pack", () => {
    // One stub engine on the record rung, so there is something to read the trace *for*. It also
    // pins the registry contract: what the ladder appends is what the table holds.
    registerEngines({
      record: (req, _sut, records) =>
        new RequirementResult({
          requirement_id: req.id,
          source_clause: sourceClause(req),
          verdict: "satisfied",
          strength: "observed",
          signals_required: req.requires,
          evidence_summary: `stub over ${records.length} record(s)`,
          binding: req.binding,
          scope: req.scope,
        }),
    })
    try {
      const sut = new Spy(
        ["artifact_logs_decision_record"],
        [{ artifact_logs_decision_record: "a" }, { artifact_logs_decision_record: "b" }],
      )
      const pack = new Pack({
        id: "p",
        title: "t",
        description: "d",
        requirements: [duty({ id: "one" }), duty({ id: "two" }), duty({ id: "three" })],
      })
      const report = checkConformance(sut, pack)
      expect(report.results.map((r) => r.strength)).toEqual(["observed", "observed", "observed"])
      expect(sut.decisionsCalled).toBe(1)
    } finally {
      registerEngines({ record: undefined })
    }
  })
})

describe("the two applicability gates", () => {
  test("an undeclared system is not_applicable on a domain-limited duty, never satisfied", () => {
    const sut = new Spy(["artifact_logs_decision_record"], [{ artifact_logs_decision_record: "a" }])
    const pack = new Pack({
      id: "p",
      title: "t",
      description: "d",
      requirements: [duty({ domains: ["consumer-credit"] })],
    })
    const report = checkConformance(sut, pack)
    expect(report.results[0].verdict).toBe("not_applicable")
    expect(report.results[0].strength).toBeNull()
    // The report owes the reader a notice: duties went unchecked for want of an input.
    expect(report.undeclaredDomainNotice).toContain("Nothing in this report says those duties are met")
    expect(report.skippedForUndeclaredDomain).toEqual(["d"])
  })

  test("a declared domain that is simply not this duty's carries no notice", () => {
    const sut = new Spy(
      ["artifact_logs_decision_record"],
      [{ artifact_logs_decision_record: "a" }],
      ["healthcare"],
    )
    const pack = new Pack({
      id: "p",
      title: "t",
      description: "d",
      requirements: [duty({ domains: ["consumer-credit"] })],
    })
    const report = checkConformance(sut, pack)
    expect(report.results[0].verdict).toBe("not_applicable")
    // That one was answered, not skipped for want of an input, so no notice.
    expect(report.undeclaredDomainNotice).toBeNull()
  })
})

describe("the evidence basis is derived from the requirement alone", () => {
  const pack = loadPack("ecoa")
  test.each([
    ["ecoa_reg_b_1002_9_b_2_principal_reasons_complete", "artifact"],
    ["ecoa_reg_b_1002_4_a_no_disparate_treatment", "relational"],
    ["ecoa_reg_b_1002_9_b_2_specific_reasons", "behavioural"],
  ] as const)("%s is on the %s basis", (id, basis) => {
    expect(evidenceBasis(pack.getRequirement(id))).toBe(basis)
  })
})
