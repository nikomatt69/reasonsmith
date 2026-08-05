/**
 * The lattice, the verdicts and the two coordinates — pinned.
 *
 * Every assertion here is a rule the rest of the port rests on. A change that makes one of these
 * fail is a change to what a verdict *means*, not a refactor.
 */

import { describe, expect, test } from "bun:test"

import {
  BASIS_RUNGS,
  RequirementResult,
  STRENGTHS,
  basisAdmits,
  combineVerdicts,
  maxStrength,
  minStrength,
} from "./index.ts"

describe("the strength lattice", () => {
  test("is a chain, unattainable at the bottom and proved at the top", () => {
    expect([...STRENGTHS]).toEqual(["unattainable", "observed", "recounted", "probed", "proved"])
    expect(minStrength(["proved", "observed", "probed"])).toBe("observed")
    expect(maxStrength(["observed", "recounted"])).toBe("recounted")
  })
})

describe("the evidence basis", () => {
  test("is a kind and never a rank: each basis admits only its own rungs", () => {
    // `relational` has no trace rung: a 2-safety property is not established by a log.
    expect(basisAdmits("relational", "observed")).toBe(false)
    // `artifact` has no proof rung, and is the only basis admitting `recounted`.
    expect(basisAdmits("artifact", "proved")).toBe(false)
    expect(basisAdmits("artifact", "recounted")).toBe(true)
    expect(basisAdmits("behavioural", "recounted")).toBe(false)
    // `assessment` reaches no rung the engines produce. `unattainable` is the one it admits, and
    // that is not an exception: the capability gate runs *before* the graded dispatch, so a system
    // that can show nothing is unattainable exactly as it was — and never a low degree.
    expect([...BASIS_RUNGS.assessment]).toEqual(["unattainable"])
    expect(basisAdmits("assessment", "observed")).toBe(false)
    expect(basisAdmits("assessment", "proved")).toBe(false)
  })
})

describe("combining verdicts", () => {
  test("combining zero verdicts is inconclusive, never vacuously satisfied", () => {
    expect(combineVerdicts([])).toBe("inconclusive")
  })

  test("propagates the worst case", () => {
    expect(combineVerdicts(["satisfied", "violated"])).toBe("violated")
    expect(combineVerdicts(["satisfied", "inconclusive"])).toBe("inconclusive")
    expect(combineVerdicts(["satisfied", "satisfied"])).toBe("satisfied")
  })
})

describe("a result may not claim more than it has", () => {
  const base = {
    requirement_id: "r",
    source_clause: "c",
    signals_required: ["s"] as const,
    binding: true,
  }

  test("a probed result cannot be built without the budget that produced it", () => {
    expect(
      () => new RequirementResult({ ...base, verdict: "satisfied", strength: "probed" }),
    ).toThrow(/search budget/)
  })

  test("a not_applicable result cannot carry a strength", () => {
    expect(
      () => new RequirementResult({ ...base, verdict: "not_applicable", strength: "observed" }),
    ).toThrow(/cannot carry evidence strength/)
  })

  test("a result with no strength cannot be reported satisfied", () => {
    expect(
      () => new RequirementResult({ ...base, verdict: "satisfied", strength: null }),
    ).toThrow(/no evidence strength/)
  })

  test("a rung the basis does not admit is refused, not rendered", () => {
    expect(
      () =>
        new RequirementResult({
          ...base,
          verdict: "satisfied",
          strength: "observed",
          basis: "relational",
        }),
    ).toThrow(/cannot be reported observed/)
  })

  test("signals_missing is populated exactly when the result is unattainable", () => {
    expect(
      () =>
        new RequirementResult({
          ...base,
          verdict: "satisfied",
          strength: "observed",
          signals_missing: ["s"],
        }),
    ).toThrow(/exactly when/)
  })

  test("an unattainable result cannot be reported satisfied or violated", () => {
    expect(
      () =>
        new RequirementResult({
          ...base,
          verdict: "violated",
          strength: "unattainable",
          signals_missing: ["s"],
        }),
    ).toThrow(/cannot be reported violated/)
  })
})
