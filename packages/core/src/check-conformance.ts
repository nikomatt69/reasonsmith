/**
 * The two applicability gates, the unattainable analysis, the engine ladder, and the run.
 *
 * Ported from the second half of `src/reasonsmith/report.py`. The order is the guarantee: a
 * requirement is answered for reach before anything runs for it, unattainability is decided from
 * declared capabilities alone (the system is never executed for it), and the decision trace is read
 * at most once — and not at all when nothing in the pack is applicable, attainable and checkable
 * here.
 */

import {
  type DecisionRecord,
  type Expr,
  UnsupportedConstructError,
  counterfactualAtom,
  parseProperty,
} from "./language.ts"
import { engines } from "./engine-registry.ts"
import {
  ConformanceReport,
  DELETED_REASON_COUNT,
  type RequirementResult,
  SUPPORTED_FORMALISMS,
  UNDECLARED_DOMAIN_KEY,
  decisionAccounts,
  notApplicable,
  notEvaluated,
  notEvaluatedForOpenTexture,
  unattainableResult,
} from "./report.ts"
import {
  type Pack,
  type Requirement,
  normalizeDomains,
  normalizeScope,
} from "./spec.ts"
import { type DeclaredLogic, type SystemUnderTest, normalizeCapabilities, readTimeDomain } from "./sut.ts"
import { STRENGTH_RANK, type EvidenceBasis, type Strength } from "./verdict.ts"

/** The state fragments: properties of one decision record. */
const STATE_FRAGMENTS = ["record", "logical"] as const

/**
 * What kind of thing this duty's evidence is about, derived from the duty alone.
 *
 * A function of the *requirement* and of nothing else — not of the system, not of which engine
 * happened to answer, and never of a field a pack author writes. That is what makes the basis a fact
 * a reader can rely on before a run: it says which rungs are reachable for this duty at all, so a
 * ceiling reads as the duty's rather than as something the system failed to expose.
 *
 * The three tests are the three branches of `engineLadder`, in that function's own order.
 */
export function evidenceBasis(req: Requirement): EvidenceBasis {
  if (req.requires.includes(DELETED_REASON_COUNT)) return "artifact"
  if (req.formalism === "counterfactual") return "relational"
  if (req.formalism === "undetermined" || req.formalism === "graded") return "assessment"
  return "behavioural"
}

/** The names a duty reads as declared inputs rather than as fields of a decision record. */
function inputOnlySignals(req: Requirement): ReadonlySet<string> {
  if (req.formalism !== "counterfactual") return new Set()
  try {
    const atom = counterfactualAtom(parseProperty(req.spec))
    return atom === null ? new Set() : new Set([atom[1]])
  } catch (error) {
    if (error instanceof UnsupportedConstructError) return new Set()
    throw error
  }
}

/**
 * The unattainable analysis for a requirement against a system.
 *
 * COMPUTED WITHOUT EXECUTING THE SYSTEM — `sut.decisions()` is never called here. The answer is the
 * set difference between the signals the requirement needs and the capability set the adapter
 * supplies.
 *
 * One name is exempt from the subtraction, and only one: the *protected* argument of a
 * `counterfactually_invariant(outcome, protected)` duty. `capabilities()` is what a system can emit
 * into a decision record, and that is the opposite direction from what this duty needs — what the
 * decision procedure *accepts*. Gating on it would report a creditor whose procedure accepts a
 * prohibited basis and whose log deliberately carries it for nobody unattainable, and tell that
 * adopter to start logging a prohibited basis per decision. The name stays in `requires` because it
 * is the one the counterfactual engine names as missing when the declared logic has no notion of it.
 */
export function analyzeUnattainable(
  req: Requirement,
  sut: SystemUnderTest,
): { unattainable: boolean; missing: readonly string[] } {
  const declared = new Set(normalizeCapabilities(sut.capabilities()))
  const exempt = inputOnlySignals(req)
  const missing = [...req.requires]
    .filter((signal) => !declared.has(signal) && !exempt.has(signal))
    .sort()
  return { unattainable: missing.length > 0, missing }
}

/**
 * A system's decision trace, refusing a shape that would be read record by record.
 *
 * A system returning one record instead of a list of records yields its key strings, which would
 * otherwise blow up deep inside the signal check with no mention of the system that caused it.
 */
function readTrace(sut: SystemUnderTest): DecisionRecord[] {
  const records = sut.decisions()
  if (!Array.isArray(records)) {
    throw new TypeError(
      `${sut.name}.decisions() must return an array of decision records, each a mapping of ` +
        `signal name to value; got ${typeof records}`,
    )
  }
  for (const record of records) {
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      throw new TypeError(
        `${sut.name}.decisions() must return an array of decision records, each a mapping of ` +
          `signal name to value; got ${record === null ? "null" : typeof record}`,
      )
    }
  }
  return [...records] as DecisionRecord[]
}

/** The trace and the declared logic, read at most once each and shared across a whole run. */
export class EvaluationResources {
  private records: DecisionRecord[] | null = null
  private tracked = false
  private traceError: unknown = null
  private logicData: DeclaredLogic | null = null
  private logicRead = false
  private logicError: unknown = null

  constructor(private readonly sut: SystemUnderTest) {}

  trace(): DecisionRecord[] {
    if (!this.tracked) {
      this.tracked = true
      try {
        this.records = readTrace(this.sut)
      } catch (error) {
        this.traceError = error
        this.records = null
      }
    }
    if (this.traceError !== null) throw this.traceError
    return this.records as DecisionRecord[]
  }

  /**
   * The trace this run actually read, and never a read it did not need.
   *
   * Deliberately not `trace()`: the promise that a run which needed no trace never executed the
   * system is the whole of `analyzeUnattainable`'s guarantee, and a report asking after the fact
   * what the decisions were must not be what breaks it. A trace nothing read, and a trace whose
   * read threw, are both reported here as no decisions.
   */
  recordsRead(): readonly DecisionRecord[] {
    return this.records ?? []
  }

  logic(): DeclaredLogic | null {
    if (!this.logicRead) {
      this.logicRead = true
      try {
        this.logicData = typeof this.sut.logic === "function" ? this.sut.logic() : null
      } catch (error) {
        this.logicError = error
        this.logicData = null
      }
    }
    if (this.logicError !== null) throw this.logicError
    return this.logicData
  }
}

/**
 * Tags a proof-rung result produced without any logic to reason over — `logic()` absent, returning
 * null, or throwing. Such a result is not an account of this evaluation, only of an interface that
 * was never there, so `evaluateRequirement` lets a lower rung's not-evaluated result displace it.
 */
export const NO_LOGIC_TO_REASON_OVER = "no_logic_to_reason_over"

/**
 * The proof rung, with a broken `logic()` reported rather than thrown.
 *
 * `logic()` is an optional interface, and one that throws has established nothing — which is what
 * `strength=null` means. Letting the exception out would take the whole evaluation down with it, so
 * a duty whose trace the record engine could have read would lose a verdict it had the evidence for.
 * A malformed *trace* is deliberately not treated this way: that is the system's own decision log
 * coming back the wrong shape, and it still throws and names the system.
 */
function runProofRung(
  req: Requirement,
  sut: SystemUnderTest,
  records: readonly DecisionRecord[] | null,
  resources: EvaluationResources,
  engine: NonNullable<ReturnType<typeof engines>["proved"]>,
): RequirementResult {
  let logicData: DeclaredLogic | null
  try {
    logicData = resources.logic()
  } catch (error) {
    const kind = error instanceof Error ? error.constructor.name : typeof error
    const message = error instanceof Error ? error.message : String(error)
    return notEvaluated(
      req,
      `Not evaluated: reading the system's decision logic failed — ${sut.name}.logic() threw ` +
        `${kind}: ${message}. Nothing was proved about this requirement.`,
      { result: NO_LOGIC_TO_REASON_OVER },
    )
  }
  const result = engine(req, sut, records, logicData)
  if (logicData === null) {
    return result.withDetails({ result: NO_LOGIC_TO_REASON_OVER })
  }
  return result
}

/** A rung of the ladder: the strength it may reach, and the engine call that stands on it. */
export type Rung = readonly [Strength, () => RequirementResult]

/**
 * Every engine that could discharge this requirement, strongest first.
 *
 * Two things decide the list, and `formalism` is only one of them. The fragment says what kind of
 * property this is; the system's *exposed surface* says what can be reasoned over. A presence
 * property checked against a trace is `observed`; the same property discharged against exposed
 * `logic()` is `proved`. Which rung a duty reaches is therefore a fact about the system, not about
 * which word a pack author typed.
 *
 * Building the ladder never *executes* the system: both optional rungs are selected from the
 * callable surface alone. Calling `logic()` here to decide whether the proof rung belongs would let
 * a system whose `logic()` throws abort a duty the record engine could have answered from its trace.
 *
 * One duty is deliberately given a ladder of **one** rung: a duty gating on `DELETED_REASON_COUNT`
 * asks whether the reasons a decision states are all the reasons its inference had, and that is
 * measured against the inference artefact or not at all. Every other rung here would answer a weaker
 * question off the system's own log — that the reason field is non-blank, or that the number the
 * system wrote in it is small — and reporting either in place of the measurement is the substitution
 * the certificate engine exists to remove.
 *
 * The `counterfactual` fragment has no trace rung, and returns before every other rung is
 * considered: `counterfactually_invariant(outcome, protected)` is a property of a *pair* of
 * executions, and no length of decision log establishes one.
 */
export function engineLadder(
  req: Requirement,
  sut: SystemUnderTest,
  records: readonly DecisionRecord[] | null,
  resources: EvaluationResources,
): Rung[] {
  const table = engines()
  const traceOf = (): readonly DecisionRecord[] => records ?? resources.trace()
  const exposesLogic = typeof sut.logic === "function"
  const exposesDecide = typeof sut.decide === "function"

  if (req.requires.includes(DELETED_REASON_COUNT)) {
    const certificate = table.certificate
    if (!certificate) return []
    return [["probed", () => certificate(req, sut, traceOf())]]
  }

  if (req.formalism === "counterfactual") {
    const ladder: Rung[] = []
    if (exposesLogic && table.counterfactualProof) {
      const proof = table.counterfactualProof
      ladder.push(["proved", () => runProofRung(req, sut, records, resources, proof)])
    }
    if (table.pairedReplay) {
      const paired = table.pairedReplay
      ladder.push([
        "probed",
        () => paired(req, sut, records, records === null ? () => resources.trace() : null),
      ])
    }
    return ladder
  }

  const ladder: Rung[] = []

  if (
    req.formalism === "temporal" &&
    exposesLogic &&
    table.temporalProof &&
    table.statePropertyUnderAlways?.(req.spec)
  ) {
    const proof = table.temporalProof
    ladder.push(["proved", () => runProofRung(req, sut, records, resources, proof)])
  }

  if ((STATE_FRAGMENTS as readonly string[]).includes(req.formalism)) {
    if (exposesLogic && table.proved) {
      const proof = table.proved
      ladder.push(["proved", () => runProofRung(req, sut, records, resources, proof)])
    }
    if (exposesDecide && table.probed) {
      const probed = table.probed
      ladder.push([
        "probed",
        () => probed(req, sut, records, records === null ? () => resources.trace() : null),
      ])
    }
  }

  // `record` is checked first and keeps the record engine. That is not an ordering detail: the
  // record engine walks a presence conjunction conjunct by conjunct and names *which* signal was
  // missing from *which* record, and the robustness monitor below cannot, because robustness is one
  // number for the whole formula.
  if (req.formalism === "record" && table.record) {
    const record = table.record
    ladder.push(["observed", () => record(req, sut, traceOf())])
  } else if ((req.formalism === "temporal" || req.formalism === "logical") && table.observed) {
    const observed = table.observed
    ladder.push(["observed", () => observed(req, sut, traceOf())])
  }

  return ladder
}

/** The regulatory class this run judges against — the argument, or the system's own. */
function declaredScope(sut: SystemUnderTest, systemScope: string | null | undefined): string | null {
  const value = systemScope ?? sut.systemScope ?? null
  normalizeScope(value)
  return value
}

/** The decision domains this run judges against — the argument, or the system's own. */
function declaredDomains(
  sut: SystemUnderTest,
  systemDomains: readonly string[] | null | undefined,
): readonly string[] {
  return normalizeDomains(systemDomains ?? sut.systemDomains ?? [])
}

/**
 * Why this duty does not reach this system, and what that is, or null when it does.
 *
 * Two independent gates, on two axes that are not the same question. `scope` is a regulatory class
 * from one statute's own fixed vocabulary; `domains` is the kind of decision the duty is about, from
 * a vocabulary this repository wrote. A duty is evaluated only when it passes both.
 *
 * Each gate fails in the same two ways — the system declared nothing, or declared something else —
 * because those two are one instruction to the reader: *say what this system is, and run it again*.
 * A duty skipped because the system declared *no* domain is flagged with `UNDECLARED_DOMAIN_KEY`:
 * that is a missing input rather than an answer, and every rendering says so. A duty skipped because
 * the system declared a domain that is simply not this duty's carries nothing — that one is a real
 * answer, and warning about it would train a reader to ignore the warning that matters.
 */
function inapplicability(
  req: Requirement,
  sysScopeNorm: string,
  sysDomains: readonly string[],
  systemScope: string | null,
): { summary: string; details: Record<string, unknown> } | null {
  if (req.scope && normalizeScope(req.scope) !== sysScopeNorm) {
    const desc = sysScopeNorm ? `declared as ${JSON.stringify(systemScope)}` : "undeclared"
    return {
      summary:
        `Not applicable: requirement scope is ${JSON.stringify(req.scope)}, but system regulatory ` +
        `class is ${desc}. reasonsmith never infers a system's regulatory class.`,
      details: {},
    }
  }
  if (req.domains.length > 0 && !req.domains.some((d) => sysDomains.includes(d))) {
    const desc = sysDomains.length > 0 ? `declared as ${sysDomains.join(", ")}` : "undeclared"
    return {
      summary:
        `Not applicable: this duty is about ${req.domains.join(", ")} decisions, but the system's ` +
        `decision domain is ${desc}. reasonsmith never infers a system's decision domain, and the ` +
        "domain vocabulary is the pack author's rather than the regulation's.",
      details: sysDomains.length > 0 ? {} : { [UNDECLARED_DOMAIN_KEY]: true },
    }
  }
  return null
}

export interface EvaluateOptions {
  records?: readonly DecisionRecord[] | null
  systemScope?: string | null
  systemDomains?: readonly string[] | null
  resources?: EvaluationResources
}

/**
 * Evaluate a single requirement against a system.
 *
 * Applicability is answered first, on the two gates `inapplicability` describes. If the adapter's
 * capability set does not cover the required signals, returns unattainable without executing the
 * system. Otherwise the ladder runs and the strongest evidence there is a basis for wins.
 *
 * The duty's own domain limit is stamped once, here, rather than threaded through four engines: an
 * engine has nothing to say about which systems a duty reaches. The evidence basis is stamped in the
 * same place and for the same reason — it is a fact about the duty rather than about the run — and
 * re-validating at the stamp means a result carrying a rung its basis does not admit is refused
 * here rather than rendered.
 */
export function evaluateRequirement(
  req: Requirement,
  sut: SystemUnderTest,
  options: EvaluateOptions = {},
): RequirementResult {
  const result = evaluateRequirementInner(req, sut, options)
  return result.stamped({ domains: req.domains, basis: evidenceBasis(req) })
}

function evaluateRequirementInner(
  req: Requirement,
  sut: SystemUnderTest,
  options: EvaluateOptions,
): RequirementResult {
  const resources = options.resources ?? new EvaluationResources(sut)
  const records = options.records ?? null

  const systemScope = declaredScope(sut, options.systemScope)
  const sysScopeNorm = normalizeScope(systemScope)
  const sysDomains = declaredDomains(sut, options.systemDomains)

  const inapplicable = inapplicability(req, sysScopeNorm, sysDomains, systemScope)
  if (inapplicable) return notApplicable(req, inapplicable.summary, inapplicable.details)

  const { unattainable, missing } = analyzeUnattainable(req, sut)
  if (unattainable) {
    return unattainableResult(req, missing, sut.capabilityBasis ?? "declared")
  }

  if (!(SUPPORTED_FORMALISMS as readonly string[]).includes(req.formalism)) {
    return notEvaluated(
      req,
      `Not evaluated: no engine in this build checks a ${JSON.stringify(req.formalism)} ` +
        "requirement. The system declares the signals this requirement needs, so it is attainable, " +
        "but nothing here establishes that the property holds.",
    )
  }

  // The two open-texture fragments return here, before the ladder, and *after* the capability gate
  // above rather than before it. That order is the whole of the guarantee that a graded semantics
  // does not make every duty answerable: a system that can show nothing is unattainable, exactly as
  // it was, and never a low degree.
  if (req.formalism === "undetermined") return notEvaluatedForOpenTexture(req)
  if (req.formalism === "graded") {
    return notEvaluated(
      req,
      "Not evaluated: this duty is graded, and this build ships no grading. A truth degree comes " +
        "from an assessment made outside this tool and is never read off the system or its log, so " +
        "without one there is nothing to measure.",
    )
  }

  const candidates = engineLadder(req, sut, records, resources)
  if (candidates.length === 0) {
    return notEvaluated(
      req,
      `Not evaluated: no engine in this build stands on a rung this duty can reach. A ` +
        `${JSON.stringify(req.formalism)} duty over the surface this system exposes has no engine ` +
        "here, and nothing weaker is substituted for one.",
      { result: "no_engine_on_a_reachable_rung" },
    )
  }

  // Take the strongest evidence there is a basis for, not the first engine tried. An engine that
  // came back with `strength=null` established nothing, so it discharged nothing, and the next rung
  // down is the strongest evidence this run actually has. The order comes from the lattice rather
  // than from the order the ladder appended, so a rung added there cannot be tried out of turn.
  //
  // When nothing established anything, the strongest engine's not-evaluated result is reported, so
  // the reader is told how the best available engine fell short. The one exception is a proof rung
  // that never had any logic to reason over: that says nothing about this evaluation, so a lower
  // rung's account of the evidence the system did supply displaces it.
  const ordered = [...candidates].sort((a, b) => STRENGTH_RANK[b[0]] - STRENGTH_RANK[a[0]])
  let fallback: RequirementResult | null = null
  for (const [, run] of ordered) {
    const result = run()
    if (result.strength !== null) return result
    if (fallback === null || fallback.details.result === NO_LOGIC_TO_REASON_OVER) {
      fallback = result
    }
  }
  return fallback as RequirementResult
}

export interface CheckConformanceOptions {
  systemName?: string
  systemScope?: string | null
  systemDomains?: readonly string[] | null
}

/**
 * Check conformance of a system against every requirement in a pack.
 *
 * Applicability and unattainability are resolved for a requirement before anything is run for it,
 * and the decision trace is read at most once — and not at all when nothing in the pack is
 * applicable, attainable and checkable here. Both are properties of `evaluateRequirement` and of the
 * shared, lazily read `EvaluationResources`, so "the unattainable analysis does not run the system"
 * does not depend on the order the requirements happen to appear in.
 *
 * A declared class outside `REGULATORY_CLASSES`, or a decision domain outside `DECISION_DOMAINS`, is
 * refused before any of that, so a misspelling cannot pass for a system that is simply out of scope.
 */
export function checkConformance(
  sut: SystemUnderTest,
  pack: Pack,
  options: CheckConformanceOptions = {},
): ConformanceReport {
  const systemScope = declaredScope(sut, options.systemScope)
  const sysDomains = declaredDomains(sut, options.systemDomains)
  const resources = new EvaluationResources(sut)
  const results = pack.requirements.map((req) =>
    evaluateRequirement(req, sut, { systemScope, systemDomains: sysDomains, resources }),
  )
  const read = resources.recordsRead()
  return new ConformanceReport({
    pack_id: pack.id,
    system_name: options.systemName ?? "SUT",
    system_scope: systemScope,
    system_domains: sysDomains,
    results,
    time_domain: readTimeDomain(read),
    decisions: decisionAccounts(read),
  })
}

/** Re-exported so a caller building a ladder by hand sees the same antecedent the engines do. */
export type { Expr }
