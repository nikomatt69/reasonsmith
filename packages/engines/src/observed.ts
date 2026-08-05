/**
 * The observed engine: every state or temporal formula that is not a presence conjunction,
 * monitored over the decision trace the system supplied.
 *
 * Ported from `src/reasonsmith/engines/observed.py`. Python monitors through rtamt's robustness
 * semantics; there is no rtamt here, so the monitor is the finite-trace interpreter in
 * `@reasonsmith/core` (`evalAt`) — the same denotation, Boolean rather than quantitative. Two
 * consequences are stated rather than hidden, because a reader comparing the two builds will meet
 * them:
 *
 *   - There is no robustness *margin* here, so the exact-tie case rtamt scores as zero robustness
 *     is decided by the comparison itself. `>=` at equality holds, which is what the language says
 *     and what the reference interpreter has always done.
 *   - A state property's witness is named by position and by the record's own identifier, which
 *     robustness could not do — one number for the whole formula cannot say which record breached.
 *     A *temporal* formula gets that only for `always(f)`, whose breach is a record's; every other
 *     temporal shape fails as a property of the trace and is reported with **no** offending record,
 *     because naming one would hand a reader a decision that may be perfectly compliant.
 *
 * What a reader must not break:
 *   - An empty trace is NOT EVALUATED, never satisfied: the top of the lattice is not evidence.
 *   - The asymmetry between the two verdicts is the trace semantics and travels on the result: a
 *     *satisfied* verdict is universal over the trace supplied and claims nothing about a decision
 *     not in it, while a *violated* verdict is existential and one witness settles it.
 *   - Where the property is an implication whose antecedent held at no position, the result is NOT
 *     EVALUATED naming the antecedent and the domain — never `satisfied`. The rule is not this
 *     engine's own: `implicationAntecedent` names the subtree and
 *     `notEvaluatedForUnreachableTrigger` words the refusal, once, for every rung.
 *   - A `contains()` atom over a value that is not a statement is NOT EVALUATED, never false. A
 *     number is not evidence about the wording of a statement.
 */

import {
  type DecisionRecord,
  type Expr,
  NotAStatementError,
  type Requirement,
  RequirementResult,
  type SystemUnderTest,
  UnsupportedConstructError,
  antecedentText,
  evalAt,
  implicationAntecedent,
  notEvaluated,
  notEvaluatedForUnreachableTrigger,
  sourceClause,
} from "@reasonsmith/core"

/**
 * The semantics a trace verdict is read under, carried on every result this engine produces.
 * `docs/semantics.md` §3, *`proved`, over a trace*.
 */
export const TRACE_SEMANTICS =
  "A satisfied verdict is universal over the decisions supplied and claims nothing about a " +
  "decision not in the trace; a violated verdict is existential and one witnessing decision " +
  "settles it. Both are statements about this trace, not about the system as built."

/**
 * The positions a *temporal* violation can honestly be pinned to, or none.
 *
 * `always(f)` over a finite trace fails exactly where `f` fails, so its witnesses are those
 * positions and a reader can be handed the record. Every other temporal shape — `eventually`,
 * `until`, `since`, and any nesting — fails as a property of the trace rather than of a decision in
 * it: there is no record that is *the* breach, and offering one would name a decision that may be
 * perfectly compliant. This returns nothing for those, and the summary says so rather than
 * inventing a witness.
 */
function witnessPositions(node: Expr, records: readonly DecisionRecord[]): number[] {
  if (node.kind !== "call" || node.name !== "always" || node.args.length !== 1) return []
  const inner = node.args[0]
  const positions: number[] = []
  for (let i = 0; i < records.length; i++) {
    try {
      if (!evalAt(inner, records, i)) positions.push(i)
    } catch {
      // A position the inner formula cannot be read at is not a witness; the caller already
      // reported anything that made the whole formula unreadable.
      return positions
    }
  }
  return positions
}

export function evaluateObserved(
  req: Requirement,
  _sut: SystemUnderTest,
  records: readonly DecisionRecord[],
): RequirementResult {
  if (records.length === 0) {
    return notEvaluated(
      req,
      "Not evaluated: the decision trace is empty, so the property was monitored over nothing. " +
        "The formula holds vacuously over an empty trace, which is the top of the lattice written " +
        "as a verdict rather than any evidence about this system.",
      { engine: "observed", reason: "empty_trace" },
    )
  }

  const node = req.property
  const antecedent = implicationAntecedent(node)
  let triggered = 0

  // Every position, so a violation names the first record that breached and a satisfaction is
  // universal over the ones supplied.
  const breaches: number[] = []
  for (let i = 0; i < records.length; i++) {
    let holds: boolean
    try {
      holds = evalAt(node, records, i)
      if (antecedent !== null && evalAt(antecedent, records, i)) triggered += 1
    } catch (error) {
      if (error instanceof NotAStatementError) {
        return notEvaluated(
          req,
          `Not evaluated: ${JSON.stringify(req.spec)} asks what a statement says, and decision ` +
            `#${i} records something that is not text there. A non-text value is not evidence ` +
            `about the wording of a statement, so the property was not read over this trace. ` +
            `${error.message}`,
          { engine: "observed", reason: "signal_without_text", error: error.message },
        )
      }
      if (error instanceof UnsupportedConstructError) {
        return notEvaluated(
          req,
          `Not evaluated: property ${JSON.stringify(req.spec)} is not expressible for this ` +
            `engine: ${error.message}`,
          { engine: "observed", reason: "property_not_expressible", error: error.message },
        )
      }
      throw error
    }
    if (!holds) breaches.push(i)
    // A temporal formula is a property of the trace *from* a position, so a top-level temporal
    // operator is answered once, at position 0, and not once per record.
    if (req.formalism === "temporal") break
  }

  if (breaches.length > 0) {
    // Which record to name. For a state property the breaching positions are the witnesses and
    // there is nothing more to find. For a temporal formula the loop above answered at position 0
    // only, so position 0 is where the *formula* failed and says nothing about where the trace
    // went wrong — naming it would hand a reader a record that may be perfectly compliant. Only
    // `always(f)` has a per-record witness at all, and `witnessPositions` finds it; every other
    // temporal shape gets no `offending_trace_segment`, because it has none to give.
    const witnesses =
      req.formalism === "temporal" ? witnessPositions(node, records) : breaches
    const at =
      witnesses.length > 0
        ? `at decision #${witnesses[0]}`
        : "over the trace as a whole — this temporal shape has no single breaching decision to name"
    return new RequirementResult({
      requirement_id: req.id,
      source_clause: sourceClause(req),
      verdict: "violated",
      strength: "observed",
      signals_required: req.requires,
      evidence_summary:
        `Violated over ${records.length} observed decision(s): ${JSON.stringify(req.spec)} does ` +
        `not hold ${at}. ${TRACE_SEMANTICS}`,
      details: {
        engine: "observed",
        records_observed: records.length,
        ...(witnesses.length > 0
          ? {
              violation_step_indices: witnesses,
              offending_trace_segment: witnesses.map((i) => records[i]),
            }
          : {}),
        trace_semantics: TRACE_SEMANTICS,
      },
      binding: req.binding,
      scope: req.scope,
    })
  }

  if (antecedent !== null && triggered === 0) {
    return notEvaluatedForUnreachableTrigger(
      req,
      antecedentText(antecedent),
      `${records.length} decision(s) of the trace`,
      { engine: "observed" },
    )
  }

  return new RequirementResult({
    requirement_id: req.id,
    source_clause: sourceClause(req),
    verdict: "satisfied",
    strength: "observed",
    signals_required: req.requires,
    evidence_summary:
      `Observed over ${records.length} decision(s): ${JSON.stringify(req.spec)} holds at every ` +
      `position of the trace supplied. ${TRACE_SEMANTICS}`,
    details: {
      engine: "observed",
      records_observed: records.length,
      trace_semantics: TRACE_SEMANTICS,
    },
    binding: req.binding,
    scope: req.scope,
  })
}
