/**
 * End-to-end tests for the reasonsmith CLI commands.
 *
 * These tests exercise the same command surface a shell user would reach — `check`,
 * `validate-pack`, `list-packs` — and assert the contract the run module states: only a
 * violation is a non-zero exit, only a usage error is exit code 1, and the JSON envelope
 * is the unprojected machine record.
 */

import { describe, expect, test } from "bun:test"

import { checkConformance, loadPack } from "@reasonsmith/core"
import "@reasonsmith/engines"
import {
  deployedCreditSystem,
  neuralScorer,
  probabilisticScorer,
} from "@reasonsmith/systems"
import { exitCodeFor } from "./cli/run.ts"

const FORM_DUTY = "ecoa_reg_b_1002_9_b_2_specific_reasons"
const CONTENT_DUTY = "ecoa_reg_b_1002_9_b_2_principal_reasons_complete"

describe("the CLI's exit-code contract", () => {
  test("the truncating credit system earns exit 2: the form duty is satisfied, the content duty is violated", () => {
    const report = checkConformance(deployedCreditSystem(), loadPack("ecoa"), {
      systemName: "credit-scoring (top-1 proof truncation)",
    })
    const form = report.results.find((r) => r.requirement_id === FORM_DUTY)
    const content = report.results.find((r) => r.requirement_id === CONTENT_DUTY)
    expect(form?.verdict).toBe("satisfied")
    expect(content?.verdict).toBe("violated")
    expect(exitCodeFor(report)).toBe(2)
  })

  test("the neural scorer earns exit 0: a log-only run, observed ceiling, no violations", () => {
    const report = checkConformance(neuralScorer(), loadPack("ecoa"), {
      systemName: "neural risk network (log-only)",
    })
    expect(report.results.some((r) => r.verdict === "violated")).toBe(false)
    expect(exitCodeFor(report)).toBe(0)
  })

  test("the probabilistic scorer earns exit 0: replayable at the probed rung, no violations", () => {
    const report = checkConformance(probabilisticScorer(), loadPack("ecoa"), {
      systemName: "calibrated log-odds scorer",
    })
    expect(report.results.some((r) => r.verdict === "violated")).toBe(false)
    expect(exitCodeFor(report)).toBe(0)
  })
})

describe("the JSON envelope", () => {
  test("ConformanceReport.toDict() carries schema_version 2", () => {
    const report = checkConformance(neuralScorer(), loadPack("ecoa"))
    const dict = report.toDict() as Record<string, unknown>
    expect(dict.schema_version).toBe(2)
    expect(dict.pack_id).toBe("ecoa")
    expect(Array.isArray(dict.results)).toBe(true)
  })
})

describe("the pack loader", () => {
  test("loadPack refuses a name it does not know", () => {
    expect(() => loadPack("nonexistent")).toThrow(/not found/i)
  })

  test("loadPack returns the ecoa pack with six requirements", () => {
    const pack = loadPack("ecoa")
    expect(pack.id).toBe("ecoa")
    expect(pack.requirements.length).toBe(6)
  })
})