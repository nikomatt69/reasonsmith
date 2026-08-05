/**
 * `@reasonsmith/engines` — the rungs of the ladder this build stands on, installed into the core's
 * engine table when this module is imported.
 *
 * Four engines ship here: the record engine (a presence conjunction, named conjunct by conjunct),
 * the observed engine (every other state or temporal formula, monitored per record), the probed
 * engine (perturb and replay through `decide()`), and the certificate engine (the reason-deletion
 * measurement against `artifact()`).
 *
 * **Two rungs of the Python build are deliberately absent, and their absence is not papered over.**
 * `proved` and the relational fragment's two rungs rest on an SMT solver, and there is none here.
 * The ladder therefore does not append them: a `logical` duty over a system that exposes `logic()`
 * falls to `probed` where `decide()` exists and to `observed` otherwise, and a `counterfactual` duty
 * — whose only rungs are the two relational ones — reports **not evaluated**, never satisfied.
 *
 * That is the honest shape for a build with no solver, and it follows the rule the Python states for
 * itself: widen the ladder when the engine lands, not before. What must never happen instead is a
 * weaker engine standing in for a missing stronger one — a trace can no more establish a
 * counterfactual here than it can there, and a bounded enumeration is not a proof.
 * `MISSING_RUNGS` names them so a rendering can say so.
 */

import { registerEngines } from "@reasonsmith/core"
import { evaluateCertificate } from "./certificate.ts"
import { evaluateObserved } from "./observed.ts"
import { evaluateProbed } from "./probed.ts"
import { evaluateRecord } from "./record.ts"

/** The rungs the Python build has and this one does not, and why. */
export const MISSING_RUNGS = [
  {
    rung: "proved",
    fragment: "record, logical, temporal",
    why:
      "the proof rung encodes the system's declared rules and the property into SMT and quantifies " +
      "over the input space the declared constraints admit. There is no solver in this build, and " +
      "a bounded enumeration over a sampled input space is the probed rung under another name.",
  },
  {
    rung: "proved / probed",
    fragment: "counterfactual",
    why:
      "the relational fragment's rungs are Z3 self-composition and paired replay. Neither is here, " +
      "and the fragment has no trace rung by construction — a trace holds what the system decided " +
      "and a counterfactual asks what it would have decided — so a counterfactual duty is reported " +
      "not evaluated rather than answered from a log.",
  },
] as const

registerEngines({
  record: evaluateRecord,
  observed: evaluateObserved,
  probed: (req, sut, records, traceProvider) =>
    evaluateProbed(req, sut, records, traceProvider),
  certificate: evaluateCertificate,
})

export { evaluateCertificate, evaluateObserved, evaluateProbed, evaluateRecord }
export { ARTIFACT_METHOD, DELETED_REASON_COUNT, SEED, STRATEGY } from "./certificate.ts"
export { DEFAULT_SEED, DEFAULT_TRIALS, planInputs } from "./probed.ts"
export { TRACE_SEMANTICS } from "./observed.ts"
