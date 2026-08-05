/**
 * The System Under Test protocol.
 *
 * Ported from `src/reasonsmith/sut.py`. What a system must expose for the probe to measure reasons
 * from it, whether its inference is monotone, and which of its signals are capabilities. The
 * capability taxonomy is a fixed vocabulary of prefixes: a signal a system *emits into a record*
 * must be declared under the `provenance_`, `scope_` or `artifact_logs_` prefixes for the
 * capability gate to recognise it.
 */

import type { DecisionRecord } from "./language.ts"
import type { InferenceArtifact } from "./artifacts.ts"

export const CAPABILITY_TAXONOMY = [
  "provenance_",
  "scope_",
  "artifact_logs_",
] as const

/** The signal naming a decision record's time domain. */
export const TIME_DOMAIN_KEY = "provenance_time_domain"

/** Ordinal time: every log that says nothing about time. */
export const ORDINAL_TIME = "ordinal"
export const EVENT_TIME = "event"

export type TimeDomain = typeof ORDINAL_TIME | typeof EVENT_TIME

/** Whether a signal name is one a system can be expected to *emit* into a record. */
export function isCapabilitySignal(name: string): boolean {
  return CAPABILITY_TAXONOMY.some((p) => name.startsWith(p))
}

/** Validate a capability collection, refusing bare strings and maps. */
export function normalizeCapabilities(value: unknown): readonly string[] {
  if (typeof value === "string") {
    throw new TypeError(
      "capabilities() must return a collection of signal names, not a single string",
    )
  }
  if (Array.isArray(value) === false) {
    throw new TypeError(`capabilities() must return an array of signal names, got ${typeof value}`)
  }
  const names = value.map((v) => {
    if (typeof v !== "string" || !v.trim())
      throw new TypeError("every capability must be a non-empty signal name")
    return v
  })
  return [...new Set(names)]
}

/**
 * The declared logic of a system, exposed through `logic()`. `variables` is the type table; the
 * `computes` names are what the system *produces* (as against the inputs its situation supplies).
 * `rules` are the decision procedure itself: the premise of the rules adapter is that the rules
 * *are* the decision procedure.
 */
export interface DeclaredRule {
  head: string
  body: string
}

export interface DeclaredLogic {
  variables: readonly string[]
  computes: readonly string[]
  rules: readonly DeclaredRule[]
}

/** Monotone: a deletion can only lower the answer, never raise it. */
export interface SystemUnderTest {
  readonly name: string
  capabilities(): readonly string[]
  decisions(): readonly DecisionRecord[]
  /** The declared decision procedure, or null when the system exposes none. */
  logic(): DeclaredLogic | null
  /** Replay one input into a decision record, for the probed rung. */
  decide?(input: DecisionRecord): DecisionRecord | null
  /** The inference artefact behind one decision, for the certificate rung. */
  artifact?(decision: DecisionRecord): InferenceArtifact | null
  /** The regulatory class the system declares itself in; null means undeclared. */
  readonly systemScope?: string | null
  /** The kinds of decision the system declares; [] means undeclared. */
  readonly systemDomains?: readonly string[]
  /** True when the system's inference is monotone in its inputs; only asked where a certificate is. */
  readonly monotone?: boolean
  /**
   * How the capability set was established. `"declared"` is a system speaking about itself as built;
   * `"trace"` is an adapter that inferred the set from a supplied trace, whose unattainable result
   * is limited to that trace rather than stated as a property of the system.
   */
  readonly capabilityBasis?: "declared" | "trace"
}

/** The time domain a trace states, or ordinal when it says nothing. */
export function readTimeDomain(records: readonly DecisionRecord[]): TimeDomain {
  for (const record of records) {
    const value = record[TIME_DOMAIN_KEY]
    if (typeof value === "string" && value.trim()) {
      return value.trim() === EVENT_TIME ? EVENT_TIME : ORDINAL_TIME
    }
  }
  return ORDINAL_TIME
}