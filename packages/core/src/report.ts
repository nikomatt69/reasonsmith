/**
 * The conformance result model and its construction-time invariants.
 *
 * Ported from `src/reasonsmith/report.py`. A result may not claim more than it has: a probed (or
 * recounted) result cannot be constructed without its search budget, a not-applicable result cannot
 * carry a strength, a result with no strength cannot be reported satisfied or violated, and a rung
 * a result's evidence basis does not admit is a refusal rather than a convention.
 */

import {
  BASIS_RUNGS,
  type EvidenceBasis,
  STRENGTH_RANK,
  type Strength,
  type Verdict,
  basisAdmits,
  parseBasis,
  parseStrength,
  parseVerdict,
} from "./verdict.ts"
import type { Requirement } from "./spec.ts"
import { normalizeDomains } from "./spec.ts"
import type { TimeDomain } from "./sut.ts"
import {
  type DecisionRecord,
  type Expr,
  printExpr,
  parseProperty,
  undeterminedAtoms,
} from "./language.ts"

export const LIMITS =
  "This report is not a compliance guarantee and is not legal advice. It assesses system " +
  "capability information and trace evidence against formal specifications. A requirement " +
  "reported without a strength was not evaluated or is not applicable, and no verdict on it " +
  "should be read from this report."

export const SUPPORTED_FORMALISMS = [
  "record",
  "temporal",
  "logical",
  "counterfactual",
  "undetermined",
  "graded",
] as const

export const OPEN_TEXTURE_KEY = "open_texture"
export const OPEN_TEXTURE_FIELDS = ["signal", "predicate", "authority"] as const

export const TRUTH_DEGREE_KEY = "truth_degree"
export const TRUTH_DEGREE_FIELDS = ["degree", "algebra", "atoms", "source"] as const

export const PROBE_BUDGET_KEY = "probe_budget"
export const PROBE_BUDGET_FIELDS = ["trials", "strategy", "seed", "input_space"] as const

export const UNDECLARED_DOMAIN_KEY = "skipped_for_undeclared_domain"

export const ENGINE_PLUGIN_KEY = "engine_plugin"

export const CERTIFICATES_KEY = "certificates"

/** False caps a certificate result at `recounted`; a higher claim is refused. */
export const EXACT_REASON_SET_KEY = "reason_set_is_exact"

export const VACUOUS_TRIGGER_KEY = "vacuous_trigger"
export const VACUOUS_TRIGGER_FIELDS = ["antecedent", "domain"] as const

export const JSON_SCHEMA_VERSION = 2

export const DECISION_RECORD_SIGNAL = "artifact_logs_decision_record"
export const REASON_SIGNAL = "artifact_logs_reason_explanation"

/**
 * The one signal the certificate engine *measures* rather than reads. A duty naming it in `requires`
 * is a duty only that engine may settle (`checkConformance`'s ladder), and a system declaring it is
 * claiming it can expose the inference artefact — not that it writes the number into a log.
 *
 * It lives here rather than in `@reasonsmith/engines` because two things need it and one of them is
 * the ladder: the ladder decides that this duty gets a single rung, and the evidence basis is
 * derived from the same test. In Python both of those import the constant from the engine; here the
 * dependency runs the other way, so the name is stated once in the layer both sides can see.
 */
export const DELETED_REASON_COUNT = "artifact_logs_deleted_reason_count"

export type ResultDetails = Record<string, unknown>

export interface RequirementResultInit {
  requirement_id: string
  source_clause: string
  verdict: Verdict | string
  strength: Strength | string | null
  signals_required: readonly string[]
  signals_missing?: readonly string[]
  evidence_summary?: string
  details?: ResultDetails
  binding?: boolean
  scope?: string
  domains?: readonly string[]
  basis?: EvidenceBasis | string
}

export class RequirementResult {
  readonly requirement_id: string
  readonly source_clause: string
  readonly verdict: Verdict
  readonly strength: Strength | null
  readonly signals_required: readonly string[]
  readonly signals_missing: readonly string[]
  readonly evidence_summary: string
  readonly details: Readonly<ResultDetails>
  readonly binding: boolean
  readonly scope: string
  readonly domains: readonly string[]
  readonly basis: EvidenceBasis

  constructor(init: RequirementResultInit) {
    this.requirement_id = init.requirement_id
    this.source_clause = init.source_clause
    this.verdict = parseVerdict(init.verdict)
    this.strength = init.strength === null ? null : parseStrength(String(init.strength))
    this.binding = Boolean(init.binding)
    this.scope = String(init.scope ?? "")
    this.domains = normalizeSignals(init.domains ?? [])
    this.basis = parseBasis(String(init.basis ?? "behavioural"))
    this.signals_required = normalizeSignals(init.signals_required)
    this.signals_missing = normalizeSignals(init.signals_missing ?? [])
    this.evidence_summary = init.evidence_summary ?? ""
    this.details = { ...(init.details ?? {}) }

    this.validate()
  }

  private validate(): void {
    const id = this.requirement_id

    if (this.verdict === "not_applicable") {
      if (this.strength !== null) {
        throw new Error(`a not_applicable requirement cannot carry evidence strength ${this.strength}`)
      }
      if (this.signals_missing.length > 0) {
        throw new Error(`a not_applicable requirement cannot have missing signals`)
      }
    }

    // Probed/recounted are bounded searches: no budget, no verdict.
    if (this.strength === "probed" || this.strength === "recounted") {
      const budget = this.details[PROBE_BUDGET_KEY]
      if (budget === null || typeof budget !== "object" || Array.isArray(budget)) {
        throw new Error(
          `${id}: a probed result must carry its search budget in details[${PROBE_BUDGET_KEY}]`,
        )
      }
      for (const field of PROBE_BUDGET_FIELDS) {
        if (!(field in (budget as Record<string, unknown>))) {
          throw new Error(`${id}: the probe budget must name ${PROBE_BUDGET_FIELDS.join(", ")}`)
        }
      }
    }

    // A reason set the system recounted caps at recounted.
    if (this.details[EXACT_REASON_SET_KEY] === false && this.strength !== null) {
      if (this.strength === "probed" || this.strength === "proved") {
        throw new Error(
          `${id}: a result measured against a reason set the system recounted cannot be ` +
            `reported ${this.strength}; recounted is the ceiling for it`,
        )
      }
    }

    // A vacuous trigger names both halves and carries no strength.
    const vacuous = this.details[VACUOUS_TRIGGER_KEY]
    if (vacuous !== null && vacuous !== undefined) {
      if (typeof vacuous !== "object" || Array.isArray(vacuous)) {
        throw new Error(`${id}: details[${VACUOUS_TRIGGER_KEY}] must name ${VACUOUS_TRIGGER_FIELDS.join(", ")}`)
      }
      const v = vacuous as Record<string, unknown>
      for (const field of VACUOUS_TRIGGER_FIELDS) {
        if (!String(v[field] ?? "").trim()) {
          throw new Error(`${id}: details[${VACUOUS_TRIGGER_KEY}] must name ${VACUOUS_TRIGGER_FIELDS.join(", ")}`)
        }
      }
      if (this.strength !== null) {
        throw new Error(`${id}: a duty whose trigger fired nowhere cannot carry strength ${this.strength}`)
      }
    }

    // Open-texture atoms name their authority and carry no strength.
    const atoms = this.details[OPEN_TEXTURE_KEY]
    if (atoms !== null && atoms !== undefined) {
      if (!Array.isArray(atoms) || atoms.length === 0) {
        throw new Error(`${id}: details[${OPEN_TEXTURE_KEY}] must be a non-empty list`)
      }
      for (const atom of atoms) {
        if (typeof atom !== "object" || Array.isArray(atom)) {
          throw new Error(`${id}: every open-texture entry must name ${OPEN_TEXTURE_FIELDS.join(", ")}`)
        }
        const a = atom as Record<string, unknown>
        for (const field of OPEN_TEXTURE_FIELDS) {
          if (!String(a[field] ?? "").trim()) {
            throw new Error(`${id}: every open-texture entry must name ${OPEN_TEXTURE_FIELDS.join(", ")}`)
          }
        }
      }
      if (this.strength !== null) {
        throw new Error(`${id}: a duty resting on a predicate no engine settles cannot carry strength ${this.strength}`)
      }
    }

    // A truth degree travels with algebra + source, lies in [0,1], and carries no strength.
    const degree = this.details[TRUTH_DEGREE_KEY]
    if (degree !== null && degree !== undefined) {
      if (typeof degree !== "object" || Array.isArray(degree)) {
        throw new Error(`${id}: details[${TRUTH_DEGREE_KEY}] must be a mapping`)
      }
      const d = degree as Record<string, unknown>
      for (const field of TRUTH_DEGREE_FIELDS) {
        if (d[field] === null || d[field] === undefined)
          throw new Error(`${id}: a truth degree must name ${TRUTH_DEGREE_FIELDS.join(", ")}`)
      }
      if (typeof d.degree !== "number" || d.degree < 0 || d.degree > 1)
        throw new Error(`${id}: a truth degree must be a number in [0, 1]`)
      if (this.strength !== null) {
        throw new Error(`${id}: a result carrying a truth degree cannot also carry strength ${this.strength}`)
      }
    }

    // A plug-in cannot report above its declared ceiling.
    const plugin = this.details[ENGINE_PLUGIN_KEY]
    if (plugin !== null && plugin !== undefined) {
      if (typeof plugin !== "object" || Array.isArray(plugin)) {
        throw new Error(`${id}: details[${ENGINE_PLUGIN_KEY}] must name the plug-in and its max_strength`)
      }
      const p = plugin as Record<string, unknown>
      if (!p.name) throw new Error(`${id}: details[${ENGINE_PLUGIN_KEY}] must name the plug-in`)
      const ceiling = parseStrength(String(p.max_strength))
      if (this.strength !== null && rankOf(this.strength) > rankOf(ceiling)) {
        throw new Error(
          `${id}: the engine plug-in ${String(p.name)} declared a maximum of ${ceiling} but reported ${this.strength}`,
        )
      }
    }

    // The two coordinates agree: a rung the basis does not admit is a refusal.
    if (this.strength !== null && !basisAdmits(this.basis, this.strength)) {
      throw new Error(
        `${id}: a result on the ${this.basis} basis cannot be reported ${this.strength}; that ` +
          `basis admits ${BASIS_RUNGS_TEXT[this.basis]} and no other rung`,
      )
    }

    const unattainable = this.strength === "unattainable"
    if (unattainable && this.verdict !== "inconclusive") {
      throw new Error(`${id}: an unattainable requirement cannot be reported ${this.verdict}`)
    }
    if (this.signals_missing.length > 0 !== unattainable) {
      throw new Error(
        `${id}: signals_missing is populated exactly when the result is unattainable`,
      )
    }
    if (this.strength === null && this.verdict !== "inconclusive" && this.verdict !== "not_applicable") {
      throw new Error(`${id}: a result with no evidence strength cannot be reported ${this.verdict}`)
    }
    const unknown = this.signals_missing.filter((s) => !this.signals_required.includes(s))
    if (unknown.length > 0) {
      throw new Error(`${id}: signals_missing names signals the requirement does not require`)
    }
  }

  /** False when no evidence of any strength was gathered. */
  get evaluated(): boolean {
    return this.strength !== null
  }

  /** The same result with `extra` merged into its details. Re-validates: `replace` does too. */
  withDetails(extra: ResultDetails): RequirementResult {
    return new RequirementResult({ ...this.init(), details: { ...this.details, ...extra } })
  }

  /**
   * The same result carrying the duty's own domain limit and evidence basis.
   *
   * Stamped once by `evaluateRequirement` rather than threaded through four engines, and
   * re-validated here rather than at rendering time: a result carrying a rung its basis does not
   * admit is refused at the stamp.
   */
  stamped(fields: { domains?: readonly string[]; basis?: EvidenceBasis }): RequirementResult {
    return new RequirementResult({ ...this.init(), ...fields })
  }

  private init(): RequirementResultInit {
    return {
      requirement_id: this.requirement_id,
      source_clause: this.source_clause,
      verdict: this.verdict,
      strength: this.strength,
      signals_required: this.signals_required,
      signals_missing: this.signals_missing,
      evidence_summary: this.evidence_summary,
      details: this.details,
      binding: this.binding,
      scope: this.scope,
      domains: this.domains,
      basis: this.basis,
    }
  }

  toDict(): Record<string, unknown> {
    return {
      requirement_id: this.requirement_id,
      source_clause: this.source_clause,
      verdict: this.verdict,
      strength: this.strength,
      signals_required: [...this.signals_required],
      signals_missing: [...this.signals_missing],
      evidence_summary: this.evidence_summary,
      details: { ...this.details },
      binding: this.binding,
      scope: this.scope,
      domains: [...this.domains],
      basis: this.basis,
    }
  }
}

function rankOf(s: Strength): number {
  return STRENGTH_RANK[s]
}

const BASIS_RUNGS_TEXT: Record<string, string> = Object.fromEntries(
  Object.entries(BASIS_RUNGS).map(([k, v]) => [k, (v as readonly string[]).join(", ")]),
)

export function normalizeSignals(value: readonly string[]): readonly string[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) throw new TypeError("signal names must be an array")
  if (value.some((s) => typeof s !== "string" || !s.trim())) {
    throw new TypeError("every signal name must be a non-empty string")
  }
  return [...value]
}

// ---------------------------------------------------------------------------
// Result constructors
// ---------------------------------------------------------------------------

/** The clause a result names as its source. */
export function sourceClause(req: Requirement): string {
  return `${req.source_document} ${req.article_clause}`
}

/** The plain not-evaluated result: the duty reaches the system and nothing was established. */
export function notEvaluated(
  req: Requirement,
  summary: string,
  details?: ResultDetails,
): RequirementResult {
  return new RequirementResult({
    requirement_id: req.id,
    source_clause: sourceClause(req),
    verdict: "inconclusive",
    strength: null,
    signals_required: req.requires,
    evidence_summary: summary,
    details: details ?? {},
    binding: req.binding,
    scope: req.scope,
  })
}

/**
 * The one result an engine returns when a duty's trigger fired nowhere it could look.
 *
 * Written once, against the result model, for the reason `language.implicationAntecedent` is written
 * once against the property language: the vacuity is a fact about the formula, the same subtree in
 * every engine, and four rungs answering it in four sentences would be four places for the rule to
 * drift. `antecedent` is the trigger as the property states it, and `domain` is the engine's own
 * account of what it searched and how much of it there was.
 *
 * The verdict is `inconclusive` at `strength=null`, which is this package's *not evaluated*. It is
 * deliberately not `satisfied` — literally true of the formula and false of the claim a reader takes
 * from it — and deliberately not `not_applicable`, which is a statement about a duty's reach that no
 * engine is in a position to make.
 */
export function notEvaluatedForUnreachableTrigger(
  req: Requirement,
  antecedent: string,
  domain: string,
  details?: ResultDetails,
): RequirementResult {
  return new RequirementResult({
    requirement_id: req.id,
    source_clause: sourceClause(req),
    verdict: "inconclusive",
    strength: null,
    signals_required: req.requires,
    evidence_summary:
      `Not evaluated: ${JSON.stringify(req.spec)} is an implication, and nothing in ${domain} made ` +
      `its antecedent ${JSON.stringify(antecedent)} true. An implication holds wherever its trigger ` +
      "is false, so this evidence would report every system alike satisfied and says nothing about " +
      "this one. A duty whose trigger never fired is reported as no evidence rather than as a clean " +
      "verdict.",
    details: { ...(details ?? {}), [VACUOUS_TRIGGER_KEY]: { antecedent, domain } },
    binding: req.binding,
    scope: req.scope,
  })
}

/**
 * The result for a duty resting on a predicate the law states without a sharp boundary.
 *
 * Deliberately not `unattainable`: the gap is not in the system, and telling an adopter to change a
 * system because a statute uses the word *meaningful* is the wrong instruction. Deliberately not
 * `not_applicable`: the duty reaches this system, and only its application to these facts is
 * unsettled. And never `satisfied` or `violated`, at any strength, because nothing here applied the
 * predicate at all.
 */
export function notEvaluatedForOpenTexture(req: Requirement): RequirementResult {
  const atoms = undeterminedAtoms(parseProperty(req.spec)).map(
    ([signal, predicate, authority]) => ({ signal, predicate, authority }),
  )
  const named = atoms
    .map(
      (atom) =>
        `whether ${atom.signal} is ${JSON.stringify(atom.predicate)} — settled by ${atom.authority}`,
    )
    .join("; ")
  const plural = atoms.length === 1 ? "" : "s"
  return new RequirementResult({
    requirement_id: req.id,
    source_clause: sourceClause(req),
    verdict: "inconclusive",
    strength: null,
    signals_required: req.requires,
    evidence_summary:
      `Not evaluated: this duty turns on ${atoms.length} predicate${plural} the law states without ` +
      `a sharp boundary, and no engine here settles ${plural ? "them" : "it"} — ${named}. The ` +
      `system can emit the signal${plural} the predicate${plural} ${plural ? "are" : "is"} about, ` +
      "so this is not a gap in the system; it is a question this tool refuses to answer in place of " +
      "the named authority. Nothing here says the duty is met, and nothing here says it is breached.",
    details: { [OPEN_TEXTURE_KEY]: atoms },
    binding: req.binding,
    scope: req.scope,
  })
}

/** The not-applicable result: no strength, no missing signals, nothing about the system. */
export function notApplicable(
  req: Requirement,
  summary: string,
  details?: ResultDetails,
): RequirementResult {
  return new RequirementResult({
    requirement_id: req.id,
    source_clause: sourceClause(req),
    verdict: "not_applicable",
    strength: null,
    signals_required: req.requires,
    evidence_summary: summary,
    details: details ?? {},
    binding: req.binding,
    scope: req.scope,
    domains: req.domains,
  })
}

/**
 * The unattainable result, worded for how the capability set was established.
 *
 * A system that declares its capabilities is speaking about itself as built. An adapter that infers
 * them from a supplied trace is not: a longer trace could carry the signal, so the result says what
 * it was read from rather than putting a claim in the system's mouth.
 */
export function unattainableResult(
  req: Requirement,
  missing: readonly string[],
  capabilityBasis: "declared" | "trace" = "declared",
): RequirementResult {
  const named = missing.join(", ")
  const summary =
    capabilityBasis === "trace"
      ? `Unattainable on the evidence supplied: no record in the supplied decision trace carries a ` +
        `value for ${named}, and the system declared no capabilities, so nothing here can discharge ` +
        "this requirement. Read from that trace alone; a longer trace could show the system emitting " +
        "these signals."
      : `Unattainable as built: the system declares no capability to emit ${named}, so no amount of ` +
        "testing can discharge this requirement. Determined from declared capabilities alone; the " +
        "system was not executed."
  return new RequirementResult({
    requirement_id: req.id,
    source_clause: sourceClause(req),
    verdict: "inconclusive",
    strength: "unattainable",
    signals_required: req.requires,
    signals_missing: missing,
    evidence_summary: summary,
    binding: req.binding,
    scope: req.scope,
  })
}

// ---------------------------------------------------------------------------
// What the trace said, in the system's own words
// ---------------------------------------------------------------------------

/**
 * What one decision record says the system decided, and the reason it stated for it.
 *
 * Both fields are the system's own words, copied out of the trace this run already read and never
 * rewritten. Either may be the empty string, which is the record saying nothing there — a distinct
 * thing from a record this run never read, and the renderings keep the two apart. Nothing here is a
 * measurement and nothing here is an explanation.
 */
export interface DecisionAccount {
  readonly decision: string
  readonly reason: string
}

function accountText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join(", ")
  }
  return String(value).trim()
}

/**
 * The decisions a trace states, in trace order, skipping records that state neither. A record
 * carrying neither a decision nor a reason yields no account at all rather than an empty one.
 */
export function decisionAccounts(
  records: readonly DecisionRecord[],
): readonly DecisionAccount[] {
  const accounts: DecisionAccount[] = []
  for (const record of records) {
    const account: DecisionAccount = {
      decision: accountText(record[DECISION_RECORD_SIGNAL]),
      reason: accountText(record[REASON_SIGNAL]),
    }
    if (account.decision || account.reason) accounts.push(account)
  }
  return accounts
}

/** The trigger as the property states it, for a result that reports one unreached. */
export function antecedentText(antecedent: Expr | null): string {
  return antecedent === null ? "" : printExpr(antecedent)
}

// ---------------------------------------------------------------------------
// Report counts
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS = [
  ["proved", "proved"],
  ["probed", "probed"],
  ["recounted", "recounted"],
  ["observed", "observed"],
  ["violated", "violated"],
  ["inconclusive", "inconclusive"],
  ["not_evaluated", "not evaluated"],
  ["on_an_assessment", "on an assessment"],
  ["unattainable", "unattainable"],
  ["not_applicable", "not applicable"],
] as const

export function categoryCounts(
  results: readonly RequirementResult[],
  prefix = "",
): Record<string, number> {
  const satisfiedAt = (s: Strength): number =>
    results.filter((r) => r.verdict === "satisfied" && r.strength === s).length

  const counts: Record<string, number> = {
    proved: satisfiedAt("proved"),
    probed: satisfiedAt("probed"),
    recounted: satisfiedAt("recounted"),
    observed: satisfiedAt("observed"),
    violated: results.filter((r) => r.verdict === "violated").length,
    inconclusive: results.filter(
      (r) =>
        r.verdict === "inconclusive" && r.evaluated && r.strength !== "unattainable",
    ).length,
    not_evaluated: results.filter(
      (r) =>
        !r.evaluated && r.verdict !== "not_applicable" && r.basis !== "assessment",
    ).length,
    on_an_assessment: results.filter(
      (r) => !r.evaluated && r.verdict !== "not_applicable" && r.basis === "assessment",
    ).length,
    unattainable: results.filter((r) => r.strength === "unattainable").length,
    not_applicable: results.filter((r) => r.verdict === "not_applicable").length,
  }
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(counts)) out[`${prefix}${key}`] = value
  return out
}

export interface ConformanceReportInit {
  pack_id: string
  system_name: string
  results: readonly RequirementResult[]
  system_scope?: string | null
  system_domains?: readonly string[]
  time_domain?: TimeDomain
  limits?: string
  decisions?: readonly DecisionAccount[]
}

export class ConformanceReport {
  readonly pack_id: string
  readonly system_name: string
  readonly results: readonly RequirementResult[]
  readonly system_scope: string | null
  readonly system_domains: readonly string[]
  readonly time_domain: TimeDomain
  readonly limits: string
  /**
   * What the trace this run read said about each decision, in the system's own words. It is an
   * input this run already read and not a finding, which is why it is *not* in `toDict()`: the JSON
   * record is the findings record, and a conformance document is not the place a production
   * decision log gets republished.
   */
  readonly decisions: readonly DecisionAccount[]

  constructor(init: ConformanceReportInit) {
    this.pack_id = init.pack_id
    this.system_name = init.system_name
    this.results = [...init.results]
    this.system_scope = init.system_scope ?? null
    this.system_domains = normalizeDomains(init.system_domains ?? [])
    this.time_domain = init.time_domain ?? "ordinal"
    this.limits = init.limits ?? LIMITS
    this.decisions = [...(init.decisions ?? [])]
  }

  get counts(): Record<string, number> {
    const binding = this.results.filter((r) => r.binding)
    const interp = this.results.filter((r) => !r.binding)
    return {
      total: this.results.length,
      binding_total: binding.length,
      ...categoryCounts(binding),
      interpretive_total: interp.length,
      ...categoryCounts(interp, "interpretive_"),
    }
  }

  get headline(): string {
    const c = this.counts
    const parts = [`${c.total} requirements`]
    const groups: Array<[string, string, string]> = [
      ["binding_total", "", "binding"],
      ["interpretive_total", "interpretive_", "interpretive"],
    ]
    for (const [totalKey, prefix, noun] of groups) {
      if (!c[totalKey]) continue
      const categories = CATEGORY_LABELS.filter(([key]) => c[`${prefix}${key}`] > 0)
        .map(([key, label]) => `${c[`${prefix}${key}`]} ${label}`)
        .join(", ")
      parts.push(`${c[totalKey]} ${noun}${categories ? `: ${categories}` : ""}`)
    }
    return parts.join(" · ")
  }

  /**
   * The duties reported not applicable *solely* because this system declared no domain. A declared
   * domain that does not meet a duty's is not counted here: that duty was answered, not skipped for
   * want of an input.
   */
  get skippedForUndeclaredDomain(): readonly string[] {
    return this.results
      .filter((r) => r.details[UNDECLARED_DOMAIN_KEY] === true)
      .map((r) => r.requirement_id)
  }

  /**
   * The one sentence every rendering owes a reader when duties went unchecked, or null.
   *
   * A run that skipped duties for a missing declaration exits exactly as a run that checked them
   * does — only a violation exits non-zero. So the report itself has to carry what the exit code
   * cannot, or a compliance gate goes green and stays green over duties nothing here looked at.
   */
  get undeclaredDomainNotice(): string | null {
    const skipped = this.skippedForUndeclaredDomain
    if (skipped.length === 0) return null
    const duties = skipped.length === 1 ? "duty was" : "duties were"
    return (
      `${skipped.length} domain-limited ${duties} reported not applicable without being checked, ` +
      "because this system declares no decision domain. Nothing in this report says those duties " +
      "are met. Declare what kind of decision this system makes — --system-domain <domain>, " +
      "repeatable, or a systemDomains property on the adapter — and run it again."
    )
  }

  toDict(): Record<string, unknown> {
    return {
      schema_version: JSON_SCHEMA_VERSION,
      pack_id: this.pack_id,
      system_name: this.system_name,
      time_domain: this.time_domain,
      system_scope: this.system_scope,
      system_domains: [...this.system_domains],
      counts: this.counts,
      headline: this.headline,
      results: this.results.map((r) => r.toDict()),
    }
  }
}