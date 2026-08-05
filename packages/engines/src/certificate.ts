/**
 * The certificate engine: whether the reasons a decision *states* are all the reasons its own
 * inference had.
 *
 * Ported from `src/reasonsmith/engines/certificate.py`. This is the bridge between the two halves of
 * the package. The certificate could always compare an engine's answer against exact inference and
 * name the reasons the engine stopped depending on, but no duty reached it — meanwhile the strongest
 * thing a reason-giving duty could claim was that the reason field was non-blank, which the
 * demonstration's own decision `APP-1042` satisfies while four of its five legally owed reasons are
 * missing. The tool shipped a counterexample to its own verdict. This engine is what closes that.
 *
 * What a reader must not break:
 *   - **The measured count is never read from the system's own record.** `envFor` writes the count
 *     the probe measured over whatever the record claimed for `artifact_logs_deleted_reason_count`.
 *     A system that could settle this duty by logging a zero would be grading its own homework.
 *   - A system exposing no `artifact()` is UNATTAINABLE naming that signal, never satisfied and
 *     never downgraded to a presence check on the reason field. The ladder gives this duty no other
 *     rung for the same reason: substituting the presence property for the adequacy property is
 *     exactly the defect this engine exists to remove.
 *   - An artefact the deletion definition of a reason does not apply to is refused **before** it is
 *     measured, and the refusal is NOT EVALUATED — never violated, never satisfied, never handed
 *     down to a weaker duty. It is *not evaluated* rather than *unattainable* because the gap is in
 *     this tool and not in the system: a creditor whose policy exceptions retract reasons is
 *     behaving as designed, and "change the system" is the wrong instruction to hand it.
 *   - **One refused artefact refuses the run**, not just its own decision.
 *   - The strength is `probed` or `recounted`, and never `proved`. Which of the two is decided by
 *     the *artefacts* and not by the search: one certified decision whose reason set the system
 *     recounted caps the whole run at `recounted`, and the flag that says so travels on the result
 *     where the result model refuses a claim above it.
 *   - A reason the probe could not settle is not counted as deleted, and the count of them is
 *     reported.
 *   - A certificate whose enumeration found *no* reason measured nothing: it is dropped, counted and
 *     reported, and no run holding one reports SATISFIED. A zero deleted-reason count on a decision
 *     whose reasons were never enumerated is the absence of a measurement, not a measurement of zero.
 *   - A certified decision whose reasons the notice never stated does not satisfy this duty
 *     vacuously.
 *   - **A violation needs one witness; a satisfaction needs complete evidence.** A measured breach
 *     stands however many decisions went unmeasured beside it; satisfied does not.
 */

import {
  CERTIFICATES_KEY,
  type Certificate,
  DELETED_REASON_COUNT,
  type DecisionRecord,
  EXACT_REASON_SET_KEY,
  PROBE_BUDGET_KEY,
  RECOUNTED_REASONS,
  type Requirement,
  RequirementResult,
  type SystemUnderTest,
  UnsupportedConstructError,
  antecedentText,
  certifyArtifact,
  deleted,
  deletionSemanticsRefusal,
  evalExpression,
  evidenceBasis,
  implicationAntecedent,
  jointlyNecessary,
  measured,
  missingReasons,
  nonMonotone,
  notEvaluated,
  notEvaluatedForUnreachableTrigger,
  probeCount,
  reasonSetIsExact,
  signalNames,
  sourceClause,
  uncertified,
  undetermined,
} from "@reasonsmith/core"

export { DELETED_REASON_COUNT }

/** The optional system method, exactly parallel to the optional `decide(case)`. */
export const ARTIFACT_METHOD = "artifact"

/** What the search does, named on every result it produces. */
export const STRATEGY =
  "for each decision the system exposed an inference artefact for, its reasons are enumerated " +
  "exactly and scored by exact weighted model counting; every fact of a reason that no other " +
  "reason uses is then switched off alone and the system's own engine re-run on the perturbed " +
  "interpretation. A reason a single deletion moves the engine on is one its answer depends on. A " +
  "reason no single deletion moves is then put to a second search, because two reasons jointly " +
  "necessary and individually removable look exactly like two dropped ones: the subset-minimal " +
  "*joint* deletions the engine notices are enumerated over the remaining facts, and a reason is " +
  "counted here only where that enumeration ran to exhaustion and met no fact of it. The probe " +
  "only ever switches a fact off, never on"

/** There is no seed: the enumeration and every probe are determined by the artefact. */
export const SEED =
  "none — the proof enumeration and the deletion probes are deterministic"

function result(
  req: Requirement,
  verdict: "satisfied" | "violated" | "inconclusive",
  strength: "probed" | "recounted" | "unattainable" | null,
  summary: string,
  extra: { missing?: readonly string[]; details?: Record<string, unknown> } = {},
): RequirementResult {
  // The basis is stamped here as well as by `evaluateRequirement`, and it is the same derivation
  // from the same requirement. It has to be: `recounted` is a rung the *artifact* row admits and the
  // default row does not, so a result carrying it could not be constructed at all before the stamp.
  return new RequirementResult({
    requirement_id: req.id,
    source_clause: sourceClause(req),
    verdict,
    strength,
    basis: evidenceBasis(req),
    signals_required: req.requires,
    signals_missing: extra.missing ?? [],
    evidence_summary: summary,
    details: extra.details ?? {},
    binding: req.binding,
    scope: req.scope,
  })
}

/** Not evaluated, because the deletion definition of a reason does not apply to this artefact. */
function refused(
  req: Requirement,
  index: number,
  refusal: string,
  declared: boolean | null,
  nonMonotoneCount = 0,
): RequirementResult {
  return result(
    req,
    "inconclusive",
    null,
    `Not evaluated: on decision #${index}, ${refusal}. Nothing is claimed either way about this ` +
      "decision or about any other in the trace, because a reason set measured under a definition " +
      "that does not hold of the inference is not evidence about the notice.",
    {
      details: {
        engine: "certificate",
        reason: "deletion_semantics_do_not_apply",
        decision_index: index,
        declared_monotone: declared,
        ...(nonMonotoneCount > 0
          ? { reasons_whose_deletion_raised_the_engines_answer: nonMonotoneCount }
          : {}),
      },
    },
  )
}

/** The record, with the measured count written over anything the record claimed for it. */
function envFor(record: DecisionRecord, cert: Certificate): DecisionRecord {
  return { ...record, [DELETED_REASON_COUNT]: deleted(cert).length }
}

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error)

export function evaluateCertificate(
  req: Requirement,
  sut: SystemUnderTest,
  records: readonly DecisionRecord[],
): RequirementResult {
  const artifact = sut.artifact
  if (typeof artifact !== "function") {
    return result(
      req,
      "inconclusive",
      "unattainable",
      "Unattainable as built: this duty asks whether the reasons a decision states are all the " +
        "reasons its inference had, which is measured against the inference artefact and never " +
        `read from a log. ${sut.name} exposes no ${ARTIFACT_METHOD}() supplying one, so ` +
        `${DELETED_REASON_COUNT} cannot be measured here. Nothing weaker stands in for it: that ` +
        "the decision states some reason is a different property, and reporting it in place of " +
        "this one is the substitution this duty exists to refuse.",
      { missing: [DELETED_REASON_COUNT] },
    )
  }

  const node = req.property
  if (!signalNames(node).includes(DELETED_REASON_COUNT)) {
    return result(
      req,
      "inconclusive",
      null,
      `Not evaluated: ${JSON.stringify(req.spec)} does not read ${DELETED_REASON_COUNT}, which is ` +
        "the only signal this engine measures. Nothing here grounds the rest of it.",
    )
  }

  if (records.length === 0) {
    return result(
      req,
      "inconclusive",
      null,
      "Not evaluated: the decision trace is empty, so there is no decision to certify. An empty " +
        "trace is not evidence that the requirement holds.",
    )
  }

  const antecedent = implicationAntecedent(node)
  // The decisions the duty's trigger reached, by index rather than as a count: the satisfied summary
  // owes a reader what it measured behind the *other* ones and set aside.
  const triggeredAt = new Set<number>()
  const certified: Array<{ index: number; cert: Certificate; held: boolean }> = []
  // The decisions whose reason set the system *recounted* rather than enumerated. One of them among
  // the certified caps the whole verdict at `recounted`: a run is only as exact as its weakest
  // artefact, exactly as a satisfaction is only as complete as its weakest decision.
  const recountedAt = new Set<number>()
  let uncertifiable = 0

  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    let supplied
    try {
      supplied = artifact.call(sut, record)
    } catch (error) {
      return result(
        req,
        "inconclusive",
        null,
        `Not evaluated: ${sut.name}.${ARTIFACT_METHOD}() threw ${describe(error)} on decision ` +
          `#${index}. Nothing was measured about this requirement.`,
      )
    }
    if (supplied === null || supplied === undefined) {
      uncertifiable += 1
      continue
    }
    // Silence claims the weaker rung: a family that enumerates says so.
    if (!reasonSetIsExact(supplied)) recountedAt.add(index)

    // Asked of the declaration before anything is measured: an artefact this definition of a reason
    // does not apply to must not be probed and then explained away.
    const declared = supplied.monotone
    const before = deletionSemanticsRefusal(declared)
    if (before) return refused(req, index, before, declared)

    let cert: Certificate
    try {
      cert = certifyArtifact(supplied)
    } catch (error) {
      return result(
        req,
        "inconclusive",
        null,
        `Not evaluated: certifying decision #${index} threw ${describe(error)}. The artefact must ` +
          "satisfy the InferenceArtifact protocol.",
      )
    }

    // And asked again of the measurement: the declaration is a claim the system makes about itself,
    // and a deletion that moved its answer *up* is the one thing that refutes it.
    const after = deletionSemanticsRefusal(declared, {
      refutedByMeasurement: nonMonotone(cert).length > 0,
    })
    if (after) return refused(req, index, after, declared, nonMonotone(cert).length)

    try {
      const env = envFor(record, cert)
      const held = Boolean(evalExpression(node, env))
      if (antecedent !== null && evalExpression(antecedent, env)) triggeredAt.add(index)
      certified.push({ index, cert, held })
    } catch (error) {
      if (!(error instanceof UnsupportedConstructError) && !(error instanceof Error)) throw error
      return result(
        req,
        "inconclusive",
        null,
        `Not evaluated: evaluating ${JSON.stringify(req.spec)} against decision #${index} threw ` +
          `${describe(error)}. The measurement was made; the property could not be decided from ` +
          "it, so nothing is claimed either way.",
      )
    }
  }

  if (certified.length === 0) {
    return result(
      req,
      "inconclusive",
      null,
      `Not evaluated: the system exposed no inference artefact for any of the ${records.length} ` +
        `decision(s) in the trace, so ${DELETED_REASON_COUNT} was measured for none of them.`,
    )
  }

  // A certificate whose enumeration found no reason at all measured nothing: its zero
  // deleted-reason count is the absence of a measurement, not a measurement of zero.
  const unenumerated = certified.filter(({ cert }) => !measured(cert)).length
  const kept = certified.filter(({ cert }) => measured(cert))
  if (kept.length === 0) {
    return result(
      req,
      "inconclusive",
      null,
      `Not evaluated: bounded proof enumeration found no reason at all behind any of the ` +
        `${unenumerated} certified decision(s), so ${DELETED_REASON_COUNT} is unmeasured for every ` +
        "one of them and no reason was switched off. A zero deleted-reason count on a decision " +
        "whose reasons were never enumerated is the absence of a measurement, not a measurement of " +
        "zero. Nothing is claimed either way.",
    )
  }

  const uncertifiedReasons = kept.reduce((n, { cert }) => n + uncertified(cert).length, 0)
  const undeterminedReasons = kept.reduce((n, { cert }) => n + undetermined(cert).length, 0)
  const jointReasons = kept.reduce((n, { cert }) => n + jointlyNecessary(cert).length, 0)
  const searches = kept.map(({ cert }) => cert.search).filter((s) => s !== null)

  const budget = {
    trials: kept.reduce((n, { cert }) => n + probeCount(cert), 0),
    strategy: STRATEGY,
    seed: SEED,
    input_space: {
      "decisions certified": kept.length,
      "facts switched off": kept.reduce(
        (n, { cert }) => n + cert.verdicts.reduce((m, v) => m + v.probeFacts.length, 0),
        0,
      ),
      // A partial enumeration may still report a reason live and may never report one deleted, so
      // whether it finished is the field carrying the whole of what `deleted` claims.
      "joint deletion patterns tried": searches.reduce((n, s) => n + s.probes, 0),
      "decisions whose joint search did not finish": searches.filter((s) => !s.exhaustive).length,
    },
  }

  // The rung this run may report at, decided by what the reason sets were rather than by what the
  // search did: the probe is the same probe either way.
  const exactReasonSets = !kept.some(({ index }) => recountedAt.has(index))
  const reached = exactReasonSets ? "probed" : "recounted"
  const recountedNote = exactReasonSets ? "" : ` Read at ${reached}: ${RECOUNTED_REASONS}.`

  const details: Record<string, unknown> = {
    engine: "certificate",
    [EXACT_REASON_SET_KEY]: exactReasonSets,
    [PROBE_BUDGET_KEY]: budget,
    decisions_certified: kept.length,
    decisions_without_an_artifact: uncertifiable,
    decisions_without_an_enumerated_reason: unenumerated,
    reasons_not_certifiable: uncertifiedReasons,
    reasons_undetermined_by_the_joint_search: undeterminedReasons,
    reasons_live_only_jointly: jointReasons,
    [CERTIFICATES_KEY]: kept.map(({ index, cert }) => ({
      decision_index: index,
      certificate_verdict: deleted(cert).length > 0 ? "FAIL" : "PASS",
      reasons_found: cert.verdicts.length,
      reasons_deleted: deleted(cert).length,
      missing_reasons: missingReasons(cert),
      attribution: cert.attribution,
    })),
  }

  // A reason no probe could isolate is not a reason shown deleted, so it never turns the verdict —
  // but a reader must be told the certified set was not complete.
  const caveat =
    (uncertifiedReasons > 0
      ? ` ${uncertifiedReasons} reason(s) could not be switched off in isolation and are counted ` +
        "neither way."
      : "") +
    (undeterminedReasons > 0
      ? ` ${undeterminedReasons} of those are reasons the joint-deletion search did not resolve, ` +
        "so they are not counted deleted: a bounded enumeration names fewer missing reasons than a " +
        "complete one, never more."
      : "")
  const skipped =
    uncertifiable > 0
      ? ` ${uncertifiable} decision(s) in the trace exposed no artefact and were not certified.`
      : ""
  const unmeasured =
    unenumerated > 0
      ? ` ${unenumerated} decision(s) had no reason enumerated at all, so ${DELETED_REASON_COUNT} ` +
        "is unmeasured for them and this verdict covers them not at all."
      : ""

  const breached = kept.filter(({ held }) => !held)
  if (breached.length > 0) {
    details.violation_step_indices = breached.map(({ index }) => index)
    details.offending_trace_segment = breached.map(({ index }) => records[index])
    const worst = breached.reduce((a, b) =>
      deleted(b.cert).length > deleted(a.cert).length ? b : a,
    ).cert
    const named = missingReasons(worst).join("; ") || "none named"
    return result(
      req,
      "violated",
      reached,
      `Violated on ${breached.length} of ${kept.length} certified decision(s): the stated reasons ` +
        `are not all the reasons. On decision #${breached[0].index} exact inference found ` +
        `${worst.verdicts.length} reason(s) and the deletion probe showed the system's answer does ` +
        `not depend on ${deleted(worst).length} of them — ${named}. Attribution: ` +
        `${worst.attribution}${caveat}${skipped}${unmeasured} Measured against the inference ` +
        `artefact the system exposed, not read from its decision log.${recountedNote}`,
      { details },
    )
  }

  // A violation needs one witness, a satisfaction needs complete evidence: the breach above stands
  // whatever went unmeasured beside it, and satisfied does not.
  if (unenumerated > 0) {
    return result(
      req,
      "inconclusive",
      null,
      `Not evaluated: bounded proof enumeration found no reason at all behind ${unenumerated} of ` +
        `the ${unenumerated + kept.length} certified decision(s), so ${DELETED_REASON_COUNT} is ` +
        `unmeasured for them. No reason was shown deleted on the other ${kept.length}, but ` +
        "satisfaction over a subset of the trace is not satisfaction over the trace: a violation " +
        `needs one witness, a satisfaction needs complete evidence.${caveat}${skipped} Nothing is ` +
        "claimed either way.",
    )
  }

  if (antecedent !== null && triggeredAt.size === 0) {
    return notEvaluatedForUnreachableTrigger(
      req,
      antecedentText(antecedent),
      `the ${kept.length} certified decision(s) of this trace`,
      details,
    )
  }

  // A certified decision whose antecedent was false was measured and then set aside: the implication
  // holds on it vacuously, so it never turns the verdict, and a summary that counted it among the
  // decisions measured clean would be false about the measurement.
  const untriggered =
    antecedent !== null ? kept.filter(({ index }) => !triggeredAt.has(index)) : []
  const setAside = untriggered.reduce((n, { cert }) => n + deleted(cert).length, 0)
  if (untriggered.length > 0) {
    details.decisions_whose_trigger_never_fired = untriggered.map(({ index }) => index)
    details.deleted_reasons_behind_an_untriggered_decision = setAside
  }
  const untouched =
    untriggered.length > 0
      ? ` On ${untriggered.length} of them the trigger ${antecedentText(antecedent)} was false — ` +
        "they stated no reasons at all — so the duty asks nothing of them and this verdict says " +
        "nothing about whether their reasons were all the reasons" +
        (setAside > 0
          ? `, including the ${setAside} reason(s) the deletion probe measured deleted behind them ` +
            "and set aside here."
          : ".")
      : ""

  return result(
    req,
    "satisfied",
    reached,
    (untriggered.length > 0
      ? `Probed over ${kept.length} certified decision(s), ${triggeredAt.size} of which the duty's ` +
        "trigger reached"
      : `Probed over ${kept.length} certified decision(s)`) +
      ": every reason exact bounded proof enumeration found is one the system's own answer depends " +
      "on, so no reason was shown deleted" +
      (untriggered.length > 0 ? " on those." : ".") +
      `${untouched}${caveat}${skipped} Holds on the decisions whose artefact was exposed and ` +
      "within the probes the budget below names; nothing here extends the claim to a decision the " +
      `system did not open up.${recountedNote}`,
    { details },
  )
}

export { notEvaluated }
