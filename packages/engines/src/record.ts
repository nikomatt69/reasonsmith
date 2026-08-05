/**
 * The record engine: a record-keeping duty, walked conjunct by conjunct over the decision trace.
 *
 * Ported from `src/reasonsmith/engines/record.py`.
 *
 * What a reader must not break:
 *   - An empty trace is reported NOT EVALUATED (`strength=null`), never satisfied. Having observed
 *     zero decisions is no empirical evidence that required fields are kept.
 *   - A missing value in an observed record is an observed violation.
 *   - The conjunction is walked **directly**. A presence property must never be routed through the
 *     robustness monitor of `observed.ts` to gain uniformity with the temporal fragment: robustness
 *     is one number for the whole formula, it cannot say *which* conjunct failed, and this engine's
 *     entire diagnostic value is naming which signal was missing from which record index.
 *   - A spec this engine cannot walk as a conjunction of presence atoms is NOT EVALUATED, never
 *     satisfied: the pack loader classifies the fragment and refuses a mismatch, so reaching here
 *     with anything else means a caller built the requirement by hand, and guessing at what it meant
 *     would answer a duty nobody wrote.
 */

import {
  type DecisionRecord,
  type Requirement,
  RequirementResult,
  type SystemUnderTest,
  UnsupportedConstructError,
  isPresent,
  notEvaluated,
  presenceAtoms,
  sourceClause,
} from "@reasonsmith/core"

export function evaluateRecord(
  req: Requirement,
  _sut: SystemUnderTest,
  records: readonly DecisionRecord[],
): RequirementResult {
  let signals: readonly string[] | null
  let why: string
  try {
    signals = presenceAtoms(req.property)
    why =
      `${JSON.stringify(req.spec)} is not a conjunction of present(signal) atoms, which is the ` +
      "only shape this engine can name a failing conjunct in"
  } catch (error) {
    if (!(error instanceof UnsupportedConstructError)) throw error
    signals = null
    why = error.message
  }

  if (signals === null || signals.length === 0) {
    return notEvaluated(req, `Not evaluated: ${why}.`, {
      reason: "spec_not_a_presence_conjunction",
    })
  }

  if (records.length === 0) {
    return notEvaluated(
      req,
      "Not evaluated: the decision trace is empty, so nothing was observed. An empty trace is not " +
        "evidence that the requirement holds.",
    )
  }

  // Walked conjunct by conjunct, in the order the property states them, so the finding can name
  // which `present(signal)` atom failed and in which record.
  const absent = [
    ...new Set(
      records.flatMap((rec) => signals.filter((signal) => !isPresent(rec[signal]))),
    ),
  ].sort()

  if (absent.length > 0) {
    const violationIndices = records
      .map((rec, index) => ({ rec, index }))
      .filter(({ rec }) => absent.some((sig) => !isPresent(rec[sig])))
      .map(({ index }) => index)
    return new RequirementResult({
      requirement_id: req.id,
      source_clause: sourceClause(req),
      verdict: "violated",
      strength: "observed",
      signals_required: req.requires,
      evidence_summary:
        `Violated over ${records.length} observed decision(s): the system declares it can emit ` +
        `these signals, but records carry no value for ${absent.join(", ")}.`,
      details: {
        engine: "record",
        signals_absent_from_trace: absent,
        records_observed: records.length,
        offending_trace_segment: violationIndices.map((index) => records[index]),
        violation_step_indices: violationIndices,
      },
      binding: req.binding,
      scope: req.scope,
    })
  }

  return new RequirementResult({
    requirement_id: req.id,
    source_clause: sourceClause(req),
    verdict: "satisfied",
    strength: "observed",
    signals_required: req.requires,
    evidence_summary:
      `Observed over ${records.length} decision(s): every required signal (${signals.join(", ")}) ` +
      "carries a value in every record. Holds on the trace supplied; nothing here extends the " +
      "claim to decisions not in it.",
    details: { engine: "record", records_observed: records.length },
    binding: req.binding,
    scope: req.scope,
  })
}
