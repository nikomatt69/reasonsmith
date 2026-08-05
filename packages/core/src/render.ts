/**
 * The renderings of a conformance report.
 *
 * Ported from the text half of `src/reasonsmith/render.py`. The renderer lives here rather than on
 * `ConformanceReport` for the reason it does in Python: a rendering edit should be a `render.ts`
 * edit and nothing in the result model.
 *
 * Two conventions bear stating because breaking either is silent:
 *
 *   - A violated finding names the offending decision record by the record's **own** `decision_id`,
 *     the same identifier the JSON rendering uses, and falls back to the step index only when a
 *     record carries no identifier — so a reader is never handed an empty name. That line lives on
 *     the text surface and was deliberately not moved into an engine summary, because
 *     `evidence_summary` travels into the JSON, so editing an engine to fix a redaction would change
 *     a second rendering.
 *   - `basisSentence` is the one place any rendering words an evidence basis, and the lay projection
 *     is shown **no basis** on the flag that already withholds the strength.
 */

import { DECISION_RECORD_SIGNAL, type ConformanceReport, type RequirementResult } from "./report.ts"
import { PROBE_BUDGET_KEY, TRUTH_DEGREE_KEY, VACUOUS_TRIGGER_KEY } from "./report.ts"
import { BASIS_RUNGS, type EvidenceBasis } from "./verdict.ts"

/**
 * The five audiences a report may be projected for.
 *
 * This vocabulary is the Python's own (`docs/semantics.md` §7). `auditor` **is** the full report by
 * identity — an auditor's question is *what is the complete evidentiary basis*, and the report the
 * run already emitted is the answer — which is why the no-flag default did not have to change to
 * acquire an audience.
 */
export const AUDIENCES = [
  "developer",
  "deployer",
  "auditor",
  "regulator",
  "affected-individual",
] as const
export type Audience = (typeof AUDIENCES)[number]

/**
 * What each audience is shown. **This table is authored, not derived** — the same kind of choice a
 * pack author makes when they pick a threshold. Nothing in the law, in the packs or in the evidence
 * says a deployer should not see a counterexample. It is written down so it can be argued with,
 * rather than left to be reverse-engineered from a record type.
 *
 * Every projection but one *suppresses*. `plainAccount` is the only field that **emits**, and it is
 * on for `affected-individual` alone. That is not a detail: built out of suppression flags alone,
 * the lay artefact was the developer's report with parts removed — its word set a strict subset of
 * the developer's — so the reader least able to fill a gap in was handed the most gaps. It must
 * never become a subset of an expert view again.
 *
 * Three rows no projection may drop: the verdict, the limits, and the notice that duties went
 * unchecked. And no audience may disagree with another about a verdict.
 */
export interface AudienceProjection {
  /** The evidence strength (the rung on the lattice). */
  readonly strength: boolean
  /** Declared scope and domains, the headline and the counts. */
  readonly headline: boolean
  /** The binding/interpretive tag, and the duty's scope and domain limits. */
  readonly classification: boolean
  /** Required signal names, and the signals absent from the trace. */
  readonly signalNames: boolean
  /** The capability signals a system does not declare. */
  readonly missingCapabilities: boolean
  /** The engine's own account of the evidence. */
  readonly evidence: boolean
  /** The search budget a probed claim carries. */
  readonly probeBudget: boolean
  /** Counterexample inputs and the witness records of a violation. */
  readonly witnesses: boolean
  /**
   * The plain-language account of what the system recorded — the one field that emits. Everything
   * it prints is quoted: the decision and the reason out of the log the run already read, and a
   * reason left unstated out of the certificate engine's own measurement. It paraphrases no statute
   * and explains no decision.
   */
  readonly plainAccount: boolean
}

/** The full report: every row. `auditor` is this by identity, and so is the no-flag default. */
const FULL: AudienceProjection = {
  strength: true,
  headline: true,
  classification: true,
  signalNames: true,
  missingCapabilities: true,
  evidence: true,
  probeBudget: true,
  witnesses: true,
  plainAccount: false,
}

export const PROJECTIONS: Record<Audience, AudienceProjection> = {
  // Asks *which signal is missing and where*, so it keeps every signal name, the absent-from-trace
  // finding, the witness records and the counterexample inputs. It drops the binding/interpretive
  // tag and the scope and domain limits: those decide whether a duty reaches this system, which is
  // not a thing a developer changes by editing the system.
  developer: { ...FULL, classification: false },
  // Asks *does this duty reach my deployment, and what must I declare or procure*. Keeps the legal
  // classification and the missing-capability finding; drops the diagnostic signal lists and the
  // witnesses. The witnesses are the sharper call: a witness table inlines real decision records,
  // which in a consumer-credit deployment are personal data about applicants, and an operator does
  // not need them to act.
  deployer: { ...FULL, signalNames: false, witnesses: false },
  auditor: FULL,
  // Asks *which duties were checked, how far does the claim reach, and what was not determined*.
  // Keeps the strength, the classification, the evidence summaries and the probe budgets — the
  // bound on a probed claim is exactly "how far does this reach". Drops signal names and witnesses:
  // the internal architecture of a system, and the personal data of the people it decided about,
  // are not what makes a claim's reach legible.
  regulator: { ...FULL, signalNames: false, missingCapabilities: false, witnesses: false },
  // The narrowest artefact, and the one with a hard rule around it: **no system internals at all**
  // — no counterexamples, no probe budgets, no signal names, no solver output, and no strength
  // vocabulary, because being told a duty is `probed` hands a person this tool's evidence model
  // instead of an answer.
  "affected-individual": {
    strength: false,
    headline: false,
    classification: false,
    signalNames: false,
    missingCapabilities: false,
    evidence: false,
    probeBudget: false,
    witnesses: false,
    plainAccount: true,
  },
}

/** An unknown audience is refused rather than widened to the full report. */
export function projectionFor(audience: string): AudienceProjection {
  const known = (AUDIENCES as readonly string[]).includes(audience)
  if (!known) {
    throw new Error(
      `Unknown audience ${JSON.stringify(audience)}; valid: ${AUDIENCES.join(", ")}`,
    )
  }
  return PROJECTIONS[audience as Audience]
}

const VERDICT_MARK: Record<string, string> = {
  satisfied: "PASS",
  violated: "FAIL",
  inconclusive: "----",
  not_applicable: "n/a ",
}

/**
 * How a basis is worded, once. A ceiling reads as the *duty's* rather than as an exposure the system
 * withheld, which is the whole reason the basis is a second coordinate and not four more rungs.
 */
export function basisSentence(basis: EvidenceBasis): string {
  const rungs = BASIS_RUNGS[basis]
  switch (basis) {
    case "behavioural":
      return `evidence about the system's own executions, one at a time (rungs: ${rungs.join(", ")})`
    case "relational":
      return `evidence about a pair of executions — a 2-safety property, which no trace establishes (rungs: ${rungs.join(", ")})`
    case "artifact":
      return `evidence measured against the inference artefact behind a decision (rungs: ${rungs.join(", ")})`
    case "assessment":
      return "a predicate an authority applies rather than anything measured from the system (no rung on the lattice)"
  }
}

/** The offending record's own identifier, or the step index when it carries none. */
function offendingName(result: RequirementResult): string | null {
  const segment = result.details.offending_trace_segment
  const indices = result.details.violation_step_indices
  if (!Array.isArray(segment) || segment.length === 0) return null
  const first = segment[0] as Record<string, unknown>
  const id = first?.decision_id ?? first?.[DECISION_RECORD_SIGNAL]
  if (typeof id === "string" && id.trim()) return id.trim()
  if (Array.isArray(indices) && indices.length > 0) return `decision #${String(indices[0])}`
  return "decision #0"
}

function rule(width = 78): string {
  return "─".repeat(width)
}

function wrap(text: string, width: number, indent: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(indent + line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(indent + line)
  return lines
}

function renderResult(result: RequirementResult, view: AudienceProjection): string[] {
  const lines: string[] = []
  const mark = VERDICT_MARK[result.verdict] ?? "????"
  // The verdict is on every row of the table: no projection may drop it, and no audience may
  // disagree with another about one.
  const strength = view.strength ? ` [${result.strength ?? "not evaluated"}]` : ""
  lines.push(`  ${mark}  ${result.requirement_id}${strength}`)
  lines.push(`        ${result.source_clause}`)
  if (view.classification) {
    const limits = [
      result.binding ? "binding" : "interpretive",
      result.scope ? `scope ${result.scope}` : null,
      result.domains.length > 0 ? `domains ${result.domains.join(", ")}` : null,
    ].filter((part): part is string => part !== null)
    lines.push(`        ${limits.join(" · ")}`)
  }
  if (view.strength) lines.push(`        basis: ${basisSentence(result.basis)}`)
  if (view.signalNames && result.signals_required.length > 0) {
    lines.push(`        requires: ${result.signals_required.join(", ")}`)
  }
  if (view.signalNames) {
    const absent = result.details.signals_absent_from_trace
    if (Array.isArray(absent) && absent.length > 0) {
      lines.push(`        absent from the trace: ${absent.map(String).join(", ")}`)
    }
  }
  // A missing *capability* is a different finding from a signal absent from a trace: one says the
  // system cannot emit it at all, the other that this log did not. The deployer sees the first and
  // not the second, which is the whole reason they are separate rows.
  if (view.missingCapabilities && result.signals_missing.length > 0) {
    lines.push(`        missing capability signals: ${result.signals_missing.join(", ")}`)
  }
  if (view.witnesses) {
    const offending = offendingName(result)
    if (offending && result.verdict === "violated") {
      lines.push(`        first offending decision: ${offending}`)
    }
    const counterexample = result.details.counterexample
    if (counterexample && typeof counterexample === "object") {
      lines.push(`        counterexample: ${JSON.stringify(counterexample)}`)
    }
  }
  if (view.evidence && result.evidence_summary) {
    lines.push(...wrap(result.evidence_summary, 68, "        "))
  }
  if (view.probeBudget) {
    const budget = result.details[PROBE_BUDGET_KEY] as Record<string, unknown> | undefined
    if (budget) {
      lines.push(`        probe budget: ${String(budget.trials)} trial(s); seed ${String(budget.seed)}`)
      const space = budget.input_space
      if (space && typeof space === "object") {
        for (const [key, value] of Object.entries(space as Record<string, unknown>)) {
          lines.push(`          ${key}: ${String(value)}`)
        }
      }
    }
  }
  if (view.evidence) {
    const vacuous = result.details[VACUOUS_TRIGGER_KEY] as Record<string, unknown> | undefined
    if (vacuous) {
      lines.push(
        `        trigger never fired: ${String(vacuous.antecedent)} over ${String(vacuous.domain)}`,
      )
    }
    const degree = result.details[TRUTH_DEGREE_KEY] as Record<string, unknown> | undefined
    if (degree) {
      // The one place a degree is formatted, and a result carrying one carries no strength — so
      // `0.7` can never read as a fraction of a rung.
      lines.push(
        `        truth degree: ${String(degree.degree)} over the ${String(degree.algebra)} algebra`,
      )
    }
  }
  return lines
}

/**
 * The lay projection's own sections: the decision and the reason, quoted out of the log, and the
 * reasons a measurement found the notice left unstated. It paraphrases no statute and explains no
 * decision.
 *
 * **Absence of a finding is never completeness.** A run where no certificate measured whether the
 * stated reasons were all the reasons prints a section saying so, because silence there reads to
 * this reader as a clean result and it is not one. Equally, no heading is printed over an empty box.
 */
function laySections(report: ConformanceReport): string[] {
  const lines: string[] = []
  lines.push("", "WHAT THE SYSTEM RECORDED ABOUT THE DECISIONS", rule())
  if (report.decisions.length === 0) {
    lines.push(
      "  This run read no decision log, so there is nothing here to quote. That is not a finding",
      "  that the decisions were sound; it is this report having seen none of them.",
    )
  }
  for (const account of report.decisions) {
    if (account.decision) lines.push(`  Decision: ${account.decision}`)
    if (account.reason) lines.push(`  Reason given: ${account.reason}`)
    lines.push("")
  }

  // Every duty answered on the artifact basis — whatever its verdict — because a reader shown only
  // the breaches would read the silence on the others as a clean result.
  const onTheArtifact = report.results.filter((r) => r.basis === "artifact")
  const missing: string[] = []
  let anyMeasured = false
  for (const result of onTheArtifact) {
    const certificates = result.details.certificates
    if (!Array.isArray(certificates)) continue
    anyMeasured = true
    for (const cert of certificates as Record<string, unknown>[]) {
      const reasons = cert.missing_reasons
      if (Array.isArray(reasons)) missing.push(...reasons.map(String))
    }
  }

  lines.push("WHETHER THE STATED REASONS WERE ALL THE REASONS", rule())
  if (!anyMeasured) {
    lines.push(
      "  Nothing in this run measured that. No inference artefact was opened up, so this report",
      "  does not say the reasons you were given were complete, and does not say they were not.",
    )
  } else if (missing.length === 0) {
    lines.push(
      "  Every reason the decision's own inference used is one the statement names, as far as this",
      "  run could measure. It measured only the decisions the system opened up.",
    )
  } else {
    lines.push("  These reasons the decision's own inference used were not stated to you:")
    for (const reason of [...new Set(missing)]) lines.push(`    · ${reason}`)
  }
  lines.push("")
  return lines
}

/** The text rendering, projected for `audience`. */
export function renderText(report: ConformanceReport, audience: Audience = "auditor"): string {
  const view = projectionFor(audience)
  const lines: string[] = []

  lines.push(rule("=".length * 78))
  lines.push("REASONSMITH CONFORMANCE REPORT")
  lines.push(rule())
  lines.push(`System:      ${report.system_name}`)
  lines.push(`Pack:        ${report.pack_id}`)
  if (view.headline) {
    lines.push(`Scope:       ${report.system_scope ?? "undeclared"}`)
    lines.push(
      `Domains:     ${report.system_domains.length > 0 ? report.system_domains.join(", ") : "undeclared"}`,
    )
    lines.push(`Time domain: ${report.time_domain}`)
    lines.push("")
    lines.push(report.headline)
  }
  lines.push("")

  lines.push("FINDINGS")
  lines.push(rule())
  for (const result of report.results) {
    lines.push(...renderResult(result, view))
    lines.push("")
  }

  const notice = report.undeclaredDomainNotice
  if (notice) {
    lines.push("NOTICE")
    lines.push(rule())
    lines.push(...wrap(notice, 76, "  "))
    lines.push("")
  }

  if (view.plainAccount) lines.push(...laySections(report))

  lines.push("LIMITS")
  lines.push(rule())
  lines.push(...wrap(report.limits, 76, "  "))
  return lines.join("\n")
}
