/**
 * The probed engine: perturb the recorded decisions, replay them through the system's own
 * `decide()`, and look for a counterexample.
 *
 * Ported from `src/reasonsmith/engines/probed.py`. This is the rung for the opaque system the proof
 * rung cannot reach and the observed rung can only watch.
 *
 * What a reader must not break:
 *   - **Probed never rounds up to proved.** "No counterexample within the budget" is a statement
 *     about a bounded search, not about the property, and it is reported at `probed` carrying the
 *     budget that produced it. `RequirementResult` refuses to construct a probed result whose
 *     details do not carry that budget: it is a construction-time invariant, not a rendering
 *     convention.
 *   - Where the property is an implication, a search in which no replayed decision reached the
 *     antecedent is NOT EVALUATED, never satisfied. "No counterexample" is worth what the search
 *     was, and a search whose trigger fired nowhere found no counterexample the way an empty search
 *     does.
 *   - **A violation needs one witness; a satisfaction needs complete evidence.** A search in which
 *     any planned input threw rather than producing a decision is NOT EVALUATED, never satisfied,
 *     naming how many went unmeasured — the inputs a system throws on are not a random sample, they
 *     are the ones its own author put outside the band it answers for, which is where a property is
 *     most at risk. Asked on the satisfied path alone: a counterexample that reproduced is a
 *     witness, and it stands however many inputs threw beside it.
 *   - No summary or budget may state a replay count larger than the number of inputs the property
 *     was read over: `inputs_errored` is carried in the budget so the two numbers reconcile.
 *   - The search MUST be reproducible: the same records, trials and seed replay the same inputs in
 *     the same order, and the seed is part of the recorded budget. A report naming a budget nobody
 *     can re-derive attests to nothing. The generator here is a small deterministic PRNG rather than
 *     Python's Mersenne Twister — the *plan* differs between the two builds, and the guarantee that
 *     it is re-derivable from `(spec, records, trials, seed)` does not.
 *   - A candidate counterexample MUST be replayed and seen to fail a second time before it is
 *     reported. One that does not reproduce is NOT EVALUATED, never violated: a system that answers
 *     differently on the same input has not been shown to violate anything, and the finding would be
 *     a defect in this search reported as a breach of the duty.
 *   - A replayed decision recording something that is not a statement where `contains()` reads one
 *     is NOT EVALUATED, never absorbed into `inputs_errored` and skipped — because the observed rung
 *     reports that same shape NOT EVALUATED, and a rung that answered `satisfied` where a weaker one
 *     answers *not evaluated* would make the stronger claim the easier one to earn.
 */

import {
  type DecisionRecord,
  NotAStatementError,
  PROBE_BUDGET_KEY,
  type Requirement,
  RequirementResult,
  type SystemUnderTest,
  UnsupportedConstructError,
  antecedentText,
  evalExpression,
  implicationAntecedent,
  notEvaluated,
  notEvaluatedForUnreachableTrigger,
  signalNames,
  sourceClause,
  walkExpr,
} from "@reasonsmith/core"

/** Inputs replayed by default. A default an adopter waits minutes for is a default nobody runs. */
export const DEFAULT_TRIALS = 200

/** Fixed rather than drawn from the clock, so a run is reproducible unless the caller asks otherwise. */
export const DEFAULT_SEED = 0

/** What the search does, named on every result it produces. */
export const STRATEGY =
  "the recorded decisions are replayed first unmodified; remaining inputs use seeded random " +
  "perturbation of one recorded decision, replacing one or two fields with values drawn from that " +
  "field's candidate pool (the values the trace shows for it, the numeric literals of the " +
  "property, and their immediate neighbours)"

/**
 * A small deterministic PRNG (mulberry32). The requirement is reproducibility from the recorded
 * seed, not any particular distribution, and a named 32-bit generator is re-derivable by anyone
 * reading the budget.
 */
function rng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The numeric literals the property itself names — the thresholds worth probing either side of. */
function specNumbers(req: Requirement): number[] {
  return [
    ...new Set(
      walkExpr(req.property)
        .filter((node): node is Extract<typeof node, { kind: "number" }> => node.kind === "number")
        .map((node) => node.value),
    ),
  ].sort((a, b) => a - b)
}

/**
 * Candidate values per field: the bounded input space this engine searches.
 *
 * A field whose values are of a kind this engine has no way to vary is left out entirely rather
 * than perturbed into something the system never sees; the budget reports the fields that *were* in
 * the space, so what was held fixed is readable.
 */
function pools(
  req: Requirement,
  records: readonly DecisionRecord[],
): Map<string, unknown[]> {
  const literals = specNumbers(req)
  const out = new Map<string, unknown[]>()
  const fields = [...new Set(records.flatMap((rec) => Object.keys(rec)))].sort()
  for (const field of fields) {
    const values = records.filter((rec) => field in rec).map((rec) => rec[field])
    let candidates: unknown[]
    if (values.some((v) => typeof v === "boolean")) {
      candidates = [true, false]
    } else if (values.length > 0 && values.every((v) => typeof v === "number")) {
      const nums = values as number[]
      const set = new Set<number>()
      for (const value of nums) {
        for (const c of [value, value + 1, value - 1, -value, 0, value * 2]) set.add(c)
      }
      for (const literal of literals) {
        for (const c of [literal, literal + 1, literal - 1]) set.add(c)
      }
      candidates = [...set].sort((a, b) => a - b)
    } else if (values.length > 0 && values.every((v) => typeof v === "string")) {
      // The empty string is the edge worth having: a reason field the system leaves blank.
      candidates = [...new Set([...(values as string[]), ""])].sort()
    } else {
      continue
    }
    out.set(field, candidates)
  }
  return out
}

const keyOf = (record: DecisionRecord): string =>
  JSON.stringify(Object.keys(record).sort().map((k) => [k, record[k]]))

/**
 * The exact inputs this engine replays, in order.
 *
 * Deterministic in `(req.spec, records, trials, seed)` and nothing else, which is what makes a
 * reported budget re-derivable. The recorded decisions come first, unperturbed: a property the
 * system already breaks on its own trace should not have to be searched for.
 */
export function planInputs(
  req: Requirement,
  records: readonly DecisionRecord[],
  trials: number = DEFAULT_TRIALS,
  seed: number = DEFAULT_SEED,
): DecisionRecord[] {
  if (trials <= 0 || records.length === 0) return []

  const pool = pools(req, records)
  const fields = [...pool.keys()].sort()
  const next = rng(seed)
  const seen = new Set<string>()
  const plan: DecisionRecord[] = []

  const offer = (record: DecisionRecord): void => {
    const k = keyOf(record)
    if (!seen.has(k)) {
      seen.add(k)
      plan.push(record)
    }
  }

  for (const rec of records) {
    offer({ ...rec })
    if (plan.length >= trials) return plan.slice(0, trials)
  }
  if (fields.length === 0) return plan.slice(0, trials)

  // Bounded so a small input space cannot spin here once every distinct input has been drawn.
  let attemptsLeft = trials * 10
  while (plan.length < trials && attemptsLeft > 0) {
    attemptsLeft -= 1
    const base = records[Math.floor(next() * records.length)]
    const record: DecisionRecord = { ...base }
    const howMany = Math.min(fields.length, next() < 0.5 ? 1 : 2)
    const chosen = [...fields]
    for (let i = chosen.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[chosen[i], chosen[j]] = [chosen[j], chosen[i]]
    }
    for (const field of chosen.slice(0, howMany)) {
      const values = pool.get(field) as unknown[]
      record[field] = values[Math.floor(next() * values.length)]
    }
    offer(record)
  }
  return plan.slice(0, trials)
}

/**
 * The decision record a replay produced. A system that answers with a full record speaks for
 * itself; one that answers with a bare label is read as the input it was given plus the answer
 * under `decision`, so this engine and the trace describe the same thing.
 */
function asRecord(input: DecisionRecord, output: unknown): DecisionRecord {
  if (output !== null && typeof output === "object" && !Array.isArray(output)) {
    return { ...(output as DecisionRecord) }
  }
  return { ...input, decision: output }
}

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error)

export interface ProbedOptions {
  trials?: number
  seed?: number
}

export function evaluateProbed(
  req: Requirement,
  sut: SystemUnderTest,
  records: readonly DecisionRecord[] | null,
  traceProvider: (() => readonly DecisionRecord[]) | null,
  options: ProbedOptions = {},
): RequirementResult {
  const trials = options.trials ?? DEFAULT_TRIALS
  const seed = options.seed ?? DEFAULT_SEED

  const decide = sut.decide
  if (typeof decide !== "function") {
    return notEvaluated(
      req,
      "Not evaluated: the system exposes no decide(), so there is nothing to replay a perturbed " +
        "input against. Active falsification needs a system that can be run.",
      { engine: "probed", reason: "no_decide" },
    )
  }

  if (trials <= 0) {
    return notEvaluated(
      req,
      `Not evaluated: the probe trial budget must be positive; got ${trials}, so the search was ` +
        "not run.",
      { engine: "probed", reason: "invalid_trial_budget", trials_requested: trials },
    )
  }

  let trace: DecisionRecord[]
  try {
    const source = records ?? (traceProvider ? traceProvider() : sut.decisions())
    trace = source.map((rec) => ({ ...rec }))
  } catch (error) {
    return notEvaluated(
      req,
      "Not evaluated: the decision trace could not be acquired, so there was no search space to " +
        `probe. ${describe(error)}`,
      { engine: "probed", reason: "trace_acquisition_failed", error: describe(error) },
    )
  }

  const plan = planInputs(req, trace, trials, seed)
  const space = pools(req, trace)
  const inputSpace: Record<string, number> = {}
  for (const [field, values] of space) inputSpace[field] = values.length

  if (plan.length === 0) {
    return notEvaluated(
      req,
      "Not evaluated: the search could not run — " +
        (trace.length === 0
          ? "the decision trace holds no decision to generate inputs around"
          : "the input planner produced no replayable input") +
        ", so nothing was perturbed and nothing was replayed.",
      {
        engine: "probed",
        reason: trace.length === 0 ? "no_seed_decisions" : "no_inputs_planned",
        records_observed: trace.length,
      },
    )
  }

  const budget = (replayed: number, errored: number): Record<string, unknown> => ({
    trials: replayed,
    trials_requested: trials,
    strategy: STRATEGY,
    seed,
    seed_decisions: trace.length,
    input_space: inputSpace,
    inputs_errored: errored,
    property_signals: [...signalNames(req.property)],
  })

  const antecedent = implicationAntecedent(req.property)
  let triggered = 0
  let errored = 0
  let firstError = ""

  for (let index = 0; index < plan.length; index++) {
    const input = plan[index]
    let record: DecisionRecord
    let holds: boolean
    try {
      record = asRecord(input, decide.call(sut, { ...input }))
      holds = evalExpression(req.property, record)
      if (antecedent !== null && evalExpression(antecedent, record)) triggered += 1
    } catch (error) {
      if (error instanceof NotAStatementError) {
        return notEvaluated(
          req,
          `Not evaluated: ${JSON.stringify(req.spec)} asks what a statement says, but replaying ` +
            `an input produced a decision recording something that is not text. A non-text value ` +
            `is not evidence about the wording of a statement, so the property was not read over ` +
            `this search. ${error.message}`,
          {
            engine: "probed",
            reason: "signal_without_text_in_replay",
            error: describe(error),
            [PROBE_BUDGET_KEY]: budget(index, errored),
          },
        )
      }
      if (error instanceof UnsupportedConstructError && errored === 0 && index === 0) {
        return notEvaluated(
          req,
          `Not evaluated: property ${JSON.stringify(req.spec)} is not expressible for this ` +
            `engine: ${error.message}`,
          { engine: "probed", reason: "property_not_expressible", error: describe(error) },
        )
      }
      // The system, or the property, has nothing to say on this input.
      errored += 1
      firstError = firstError || describe(error)
      continue
    }

    if (holds) continue

    // Verify before reporting: a candidate that does not fail a second time is a defect in this
    // search, not a finding about the system.
    let reproduced: boolean
    let replayNote = ""
    try {
      const replay = asRecord(input, decide.call(sut, { ...input }))
      reproduced = !evalExpression(req.property, replay)
    } catch (error) {
      reproduced = false
      replayNote = ` Replay threw ${describe(error)}.`
    }

    if (!reproduced) {
      return notEvaluated(
        req,
        `Not evaluated: an input failed property ${JSON.stringify(req.spec)} once but did not ` +
          `reproduce when replayed against the system's own decide().${replayNote} A ` +
          "counterexample that does not reproduce is a defect in this search, not a violation, " +
          "and is never reported as one.",
        {
          engine: "probed",
          reason: "counterexample_did_not_reproduce",
          unverified_counterexample: input,
          [PROBE_BUDGET_KEY]: budget(index + 1, errored),
        },
      )
    }

    return new RequirementResult({
      requirement_id: req.id,
      source_clause: sourceClause(req),
      verdict: "violated",
      strength: "probed",
      signals_required: req.requires,
      evidence_summary:
        `Violated under active perturbation: replaying an input through the system's own decide() ` +
        `produced a decision that fails ${JSON.stringify(req.spec)}, and the counterexample ` +
        "reproduced when replayed a second time.",
      details: {
        engine: "probed",
        counterexample: input,
        counterexample_decision: record,
        offending_trace_segment: [record],
        violation_step_indices: [index],
        verification:
          "Counterexample replayed against the system's own decide() and failed the property again.",
        [PROBE_BUDGET_KEY]: budget(index + 1, errored),
      },
      binding: req.binding,
      scope: req.scope,
    })
  }

  if (errored === plan.length) {
    return notEvaluated(
      req,
      `Not evaluated: the search could not run — every one of the ${plan.length} replayed inputs ` +
        `threw rather than producing a decision this property could be read over. First failure: ` +
        `${firstError}.`,
      {
        engine: "probed",
        reason: "every_replay_failed",
        error: firstError,
        [PROBE_BUDGET_KEY]: budget(plan.length, errored),
      },
    )
  }

  // A violation needs one witness, a satisfaction needs complete evidence. Asked before the trigger
  // guard on purpose: where inputs threw, "the antecedent fired nowhere" is a claim about the
  // measured part alone, and the inputs that threw are exactly the ones that might have reached it.
  const measured = plan.length - errored
  if (errored > 0) {
    return notEvaluated(
      req,
      `Not evaluated: ${errored} of the ${plan.length} input(s) this search planned threw rather ` +
        `than producing a decision this property could be read over, so the property is unmeasured ` +
        `on them. No counterexample to ${JSON.stringify(req.spec)} was found in the other ` +
        `${measured}, but satisfaction over the part of the search space that answered is not ` +
        "satisfaction over the search space: a violation needs one witness, a satisfaction needs " +
        `complete evidence. First failure: ${firstError}. Nothing is claimed either way.`,
      {
        engine: "probed",
        reason: "inputs_unmeasured",
        error: firstError,
        [PROBE_BUDGET_KEY]: budget(plan.length, errored),
      },
    )
  }

  if (antecedent !== null && triggered === 0) {
    return notEvaluatedForUnreachableTrigger(
      req,
      antecedentText(antecedent),
      `the ${measured} decision(s) this search replayed`,
      { engine: "probed", [PROBE_BUDGET_KEY]: budget(plan.length, errored) },
    )
  }

  return new RequirementResult({
    requirement_id: req.id,
    source_clause: sourceClause(req),
    verdict: "satisfied",
    strength: "probed",
    signals_required: req.requires,
    evidence_summary:
      // `measured`, never `plan.length`: the count names the inputs this property was actually read
      // over. The guard above makes the two equal here, and saying so in the arithmetic keeps the
      // sentence true of its own accord rather than by grace of a check several lines up.
      `Probed: no counterexample to ${JSON.stringify(req.spec)} in ${measured} input(s) replayed ` +
      `through the system's own decide() (seed ${seed}, generated by perturbing ${trace.length} ` +
      `recorded decision(s) over ${Object.keys(inputSpace).length} field(s)). This is a bounded ` +
      "search, not a proof: the property is unchecked outside the inputs this budget names.",
    details: { engine: "probed", [PROBE_BUDGET_KEY]: budget(plan.length, errored) },
    binding: req.binding,
    scope: req.scope,
  })
}
