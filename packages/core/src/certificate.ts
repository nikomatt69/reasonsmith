/**
 * The reason-deletion certificate: the reasons an engine's answer turns out not to depend on.
 *
 * Ported from `src/reasonsmith/certificate.py`. What a `deleted` reason **is** is the abductive
 * explanation of Ignatiev/Narodytska/Marques-Silva and its contrastive dual, specialised to the
 * deletions an `InferenceArtifact` admits and resting on Reiter's minimal-hitting-set duality.
 *
 * Four things must not be undone:
 *
 *   - The monotonicity declaration is what every lemma rests on, so it is one premise with the
 *     artefact protocol and not two. `artifacts.deletionSemanticsRefusal` is asked before anything
 *     is measured and again of the measurement afterwards.
 *   - `live` is existential and one contrastive set establishes it, while `deleted` is universal and
 *     needs the enumeration to have **finished** — so a partial search reports `undetermined`, and
 *     there is no budget at which this instrument names more missing reasons than a complete search.
 *   - The joint pass only ever moves a reason *out* of `deleted`, and never promotes an
 *     `unseparable` one into it.
 *   - **Every** private fact of a reason is switched off, not the first in sort order, because
 *     coverage decided by a field's name gave two otherwise identical systems different probes. The
 *     budget therefore counts facts switched off, not reasons.
 */

import {
  type Fact,
  type InferenceArtifact,
  deletionSemanticsRefusal,
} from "./artifacts.ts"
import {
  DEFAULT_PROBE_BUDGET,
  type DeletionSearch,
  contrastiveSets,
} from "./explanations.ts"

export const CERTIFICATE_LIMITS =
  "A certificate is exact on one inference artefact and one base interpretation. It says which " +
  "reasons this decision's own answer turned out not to depend on, within the enumeration bound " +
  "the artefact declares and the probes the budget names. It says nothing about a decision the " +
  "system did not expose, and nothing about the law."

export const NON_MONOTONE_REMARK =
  "switching this fact off *raised* the engine's answer, which is the one fingerprint a " +
  "non-monotone inference leaves"

export type ReasonStatus =
  | "live"
  | "deleted"
  | "unseparable"
  | "inconclusive"
  | "undetermined"

export interface ReasonVerdict {
  readonly reason: ReadonlySet<Fact>
  readonly label: string
  readonly score: number
  readonly status: ReasonStatus
  /** The fact whose probe settled this status, or null when no probe did. */
  readonly probeFact: Fact | null
  readonly exactDrop: number
  readonly engineDrop: number
  readonly detail: string
  /** Every private fact of this reason — all of which were switched off, one at a time. */
  readonly probeFacts: readonly Fact[]
  /** Engine re-runs this reason cost. */
  readonly engineProbes: number
  /** True when a deletion raised the engine's answer. Can refute a declaration, never confirm one. */
  readonly nonMonotone: boolean
  /** The joint deletion that showed this reason live, when no single one did. */
  readonly jointWitness: readonly Fact[]
}

export interface Certificate {
  readonly query: string
  readonly adapterName: string
  readonly claimedSemantics: string
  readonly exactDepth: number | null
  readonly exactValue: number
  readonly engineValue: number
  readonly tol: number
  readonly verdicts: readonly ReasonVerdict[]
  readonly attribution: string
  readonly exactInference: string
  readonly monotone: boolean | null
  readonly search: DeletionSearch | null
}

const by = (cert: Certificate, status: ReasonStatus): readonly ReasonVerdict[] =>
  cert.verdicts.filter((v) => v.status === status)

export const deleted = (cert: Certificate) => by(cert, "deleted")
export const live = (cert: Certificate) => by(cert, "live")
export const unseparable = (cert: Certificate) => by(cert, "unseparable")
export const inconclusive = (cert: Certificate) => by(cert, "inconclusive")
export const undetermined = (cert: Certificate) => by(cert, "undetermined")

/** The three separately reported states in which the probe settled nothing. */
export const uncertified = (cert: Certificate): readonly ReasonVerdict[] => [
  ...unseparable(cert),
  ...inconclusive(cert),
  ...undetermined(cert),
]

/** Reasons the engine depends on only jointly with others. */
export const jointlyNecessary = (cert: Certificate): readonly ReasonVerdict[] =>
  cert.verdicts.filter((v) => v.status === "live" && v.jointWitness.length > 0)

/** Reasons whose deletion *raised* the engine's answer. */
export const nonMonotone = (cert: Certificate): readonly ReasonVerdict[] =>
  cert.verdicts.filter((v) => v.nonMonotone)

export const valueGap = (cert: Certificate): number => cert.engineValue - cert.exactValue

/**
 * Whether this certificate measured anything at all.
 *
 * A certificate whose enumeration found *no* reason has a zero deleted-reason count for the same
 * reason a decision whose reasons the engine all used does, and the two are not the same fact. This
 * is the single predicate for telling them apart, and every caller asks it rather than reading the
 * zero.
 */
export const measured = (cert: Certificate): boolean => cert.verdicts.length > 0

/** The reasons a notice generated from this engine would leave out, named. */
export const missingReasons = (cert: Certificate): string[] =>
  deleted(cert)
    .slice()
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .map((v) => v.label)

/** PASS only where something was measured and nothing was found deleted. */
export function certificateVerdict(cert: Certificate): "PASS" | "FAIL" | "UNCERTIFIED" {
  if (!measured(cert)) return "UNCERTIFIED"
  if (deleted(cert).length > 0) return "FAIL"
  if (uncertified(cert).length > 0) return "UNCERTIFIED"
  return "PASS"
}

function signed(value: number, digits = 6): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`
}

function attribute(
  verdicts: readonly ReasonVerdict[],
  gap: number,
  tol: number,
): string {
  const del = verdicts.filter((v) => v.status === "deleted")
  const liv = verdicts.filter((v) => v.status === "live")
  const unc = verdicts.filter((v) =>
    v.status === "unseparable" || v.status === "inconclusive" || v.status === "undetermined",
  )
  if (verdicts.length === 0) {
    if (Math.abs(gap) > tol) {
      return (
        "Exact inference found no reason for this query at this depth, and yet the engine returns a " +
        `value ${signed(gap)} away from it. No reason was probed, so nothing is certified either ` +
        "way, and the engine's answer rests on something this enumeration did not find: an " +
        "unsupported query, a wrong identifier, or a proof bound below the one the engine itself uses."
      )
    }
    return (
      "Exact inference found no reason for this query at this depth, so no reason was probed and " +
      "there was nothing to compare: an unsupported query, a wrong identifier or a proof bound too " +
      "low all look like this. Nothing about the engine is certified either way."
    )
  }
  if (del.length === 0) {
    if (Math.abs(gap) > tol) {
      return (
        `No reason was deleted, but the engine's value differs from exact inference by ${signed(gap)}. ` +
        "The responsible setting is the engine's aggregation over the reasons it kept, not proof " +
        "truncation: every reason still moves the answer."
      )
    }
    if (unc.length > 0) {
      return (
        `No reason was shown deleted, but ${unc.length} could not be probed in isolation, so the ` +
        "reason set is not certified complete."
      )
    }
    return (
      "The engine used every reason exact inference found, and its value matched the exact value " +
      "within tolerance. No inference setting is implicated on this input."
    )
  }
  const order = [...verdicts].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
  const tail = new Set(liv.length > 0 ? order.slice(liv.length) : order)
  const deletedIsTail =
    liv.length > 0 && del.length === tail.size && del.every((v) => tail.has(v))
  if (deletedIsTail && unc.length === 0) {
    return (
      `The deleted reasons are exactly the ${del.length} lowest-scoring of the ${verdicts.length}, ` +
      `and the engine kept the top ${liv.length}. This is the signature of top-k proof truncation ` +
      `at k=${liv.length}: top-k works by discarding proofs, so the dropped reasons are lost by ` +
      `configuration, not by error. The missing probability mass is ${(-gap).toFixed(6)}.`
    )
  }
  return (
    `${del.length} reason(s) deleted, but they are not the ${del.length} lowest-scoring reasons, so ` +
    "score-ordered top-k truncation does not explain the loss. Some other setting in the engine — " +
    "proof search bound, pruning heuristic, or a defect — is dropping reasons the exact enumeration " +
    "found."
  )
}

/** The same inference with every fact of `facts` switched off, one `without` at a time. */
function deleteFacts(artifact: InferenceArtifact, facts: Iterable<Fact>): InferenceArtifact {
  let perturbed = artifact
  for (const fact of [...facts].sort()) perturbed = perturbed.without(fact)
  return perturbed
}

/**
 * Re-decide every candidate-`deleted` reason against the *joint* deletions the engine notices.
 *
 * Three outcomes per candidate: a reason holding a **private** relevant fact is `live` — the
 * movement is attributable to it and to nothing else; a reason **no** fact of which is relevant is
 * `deleted`, which needs no attribution and is claimed only on an exhausted enumeration; anything
 * else is `undetermined`.
 *
 * This pass only ever moves a reason *out* of `deleted`. It never promotes an `unseparable` or
 * `inconclusive` reason into it, though the definition would let it: that would mint new accusations
 * out of a search whose completeness rests on a declaration nothing here confirms.
 */
function resolveJointly(
  artifact: InferenceArtifact,
  verdicts: readonly ReasonVerdict[],
  facts: ReadonlyMap<Fact, number>,
  singletonMoved: ReadonlySet<Fact>,
  engineValue: number,
  tol: number,
  budget: number,
): { verdicts: ReasonVerdict[]; search: DeletionSearch } {
  // A fact whose deletion alone already moves the engine lies in no contrastive set of size greater
  // than one, so it is not searched over.
  const space = [...facts.keys()].filter((f) => !singletonMoved.has(f)).sort()
  const search = contrastiveSets(
    (toDelete) => Math.abs(engineValue - deleteFacts(artifact, toDelete).engineValue()) > tol,
    space,
    budget,
  )

  const resolved: ReasonVerdict[] = []
  for (const v of verdicts) {
    if (v.status !== "deleted") {
      resolved.push(v)
      continue
    }
    const priv = v.probeFacts.filter((f) => search.relevant.has(f))
    const shared = [...v.reason].filter((f) => search.relevant.has(f)).sort()
    if (priv.length > 0) {
      const witnesses = search.contrastive.filter((c) => priv.some((f) => c.has(f)))
      const witness = witnesses.sort(
        (a, b) => a.size - b.size || [...a].sort().join(" ").localeCompare([...b].sort().join(" ")),
      )[0]
      const named = [...witness].sort().join(", ")
      resolved.push({
        ...v,
        status: "live",
        jointWitness: [...witness].sort(),
        detail:
          `no fact of this reason moves the engine when switched off alone, but switching off ` +
          `${named} together does: the engine's answer depends on this reason jointly with the ` +
          "others in that set, so it is not deleted.",
      })
    } else if (shared.length > 0) {
      resolved.push({
        ...v,
        status: "undetermined",
        detail:
          `no fact of this reason moves the engine alone or jointly except ${shared.join(", ")}, ` +
          "which another reason also holds, so the engine's dependence cannot be attributed to this " +
          "reason rather than to the one sharing that fact; not certified either way.",
      })
    } else if (!search.exhaustive) {
      resolved.push({
        ...v,
        status: "undetermined",
        detail:
          `no single deletion moves the engine on this reason, and the joint search spent its ` +
          `${search.budget}-probe budget over ${search.space.length} fact(s) without exhausting the ` +
          "deletion lattice, so no reason is deleted on the strength of it; not certified either way.",
      })
    } else {
      resolved.push(v)
    }
  }
  return { verdicts: resolved, search }
}

/**
 * Compare the reasons an engine actually used against the exact set, and name what is missing.
 *
 * The representation-neutral core: everything it knows about the inference it reads through
 * `InferenceArtifact`, so a second family of artefact is an adapter and not a branch here.
 */
export function certifyArtifact(
  artifact: InferenceArtifact,
  tol = 1e-9,
  budget: number = DEFAULT_PROBE_BUDGET,
): Certificate {
  const refusal = deletionSemanticsRefusal(artifact.monotone)
  void refusal // asked by the engine before it gets here; measured here regardless, never read past it

  const reasons = artifact.reasons()
  const exactValue = artifact.exactValue()
  const engineValue = artifact.engineValue()

  const seen = new Map<Fact, number>()
  for (const reason of reasons) {
    for (const fact of reason) seen.set(fact, (seen.get(fact) ?? 0) + 1)
  }

  let verdicts: ReasonVerdict[] = []
  // Facts whose deletion *alone* already moves the engine. They lie in no contrastive set of size
  // greater than one, so the joint pass below does not search over them.
  const singletonMoved = new Set<Fact>()

  for (const reason of reasons) {
    const label = artifact.label(reason)
    const score = artifact.score(reason)
    const priv = [...reason].filter((f) => seen.get(f) === 1).sort()
    if (priv.length === 0) {
      verdicts.push({
        reason,
        label,
        score,
        status: "unseparable",
        probeFact: null,
        exactDrop: 0,
        engineDrop: 0,
        detail:
          "every fact of this reason is shared with another reason, so it cannot be switched off " +
          "alone; not certified either way.",
        probeFacts: [],
        engineProbes: 0,
        nonMonotone: false,
        jointWitness: [],
      })
      continue
    }
    // Every private fact, one at a time. Probing one of them and calling the reason answered made
    // coverage a function of the facts' names: two systems alike but for a field name got different
    // probes.
    const signal: Array<[Fact, number, number]> = []
    const silent: Array<[Fact, number]> = []
    for (const probe of priv) {
      const probed = artifact.without(probe)
      const exactDrop = exactValue - probed.exactValue()
      if (exactDrop <= tol) {
        silent.push([probe, exactDrop])
        continue
      }
      signal.push([probe, exactDrop, engineValue - probed.engineValue()])
    }
    const coverage =
      priv.length > 1
        ? ` All ${priv.length} private fact(s) of this reason were switched off, one at a time.`
        : ""

    if (signal.length === 0) {
      const [probe, exactDrop] = silent[0]
      verdicts.push({
        reason,
        label,
        score,
        status: "inconclusive",
        probeFact: probe,
        exactDrop,
        engineDrop: 0,
        detail:
          `deleting ${probe} does not move exact inference either (${exactDrop.toExponential(2)}), ` +
          `so the probe carries no signal; not certified either way.${coverage}`,
        probeFacts: priv,
        engineProbes: 0,
        nonMonotone: false,
        jointWitness: [],
      })
      continue
    }

    const moved = signal.filter(([, , engineDrop]) => Math.abs(engineDrop) > tol)
    for (const [fact] of moved) singletonMoved.add(fact)
    // A rise is the one fingerprint a non-monotone engine leaves, so it is the probe reported.
    const rose = moved.filter(([, , engineDrop]) => engineDrop < -tol)
    if (moved.length > 0) {
      const [probe, exactDrop, engineDrop] = (rose.length > 0 ? rose : moved)[0]
      verdicts.push({
        reason,
        label,
        score,
        status: "live",
        probeFact: probe,
        exactDrop,
        engineDrop,
        detail:
          `deleting ${probe} moves exact inference by ${signed(-exactDrop)} and the engine by ` +
          `${signed(-engineDrop)}: the engine's answer depends on this reason.${coverage}` +
          (rose.length > 0
            ? ` ${NON_MONOTONE_REMARK[0].toUpperCase()}${NON_MONOTONE_REMARK.slice(1)}.`
            : ""),
        probeFacts: priv,
        engineProbes: signal.length,
        nonMonotone: rose.length > 0,
        jointWitness: [],
      })
    } else {
      const [probe, exactDrop, engineDrop] = signal[0]
      verdicts.push({
        reason,
        label,
        score,
        status: "deleted",
        probeFact: probe,
        exactDrop,
        engineDrop,
        detail:
          `deleting ${probe} moves exact inference by ${signed(-exactDrop)} but leaves the engine ` +
          `unchanged: the engine's answer does not depend on this reason.${coverage}`,
        probeFacts: priv,
        engineProbes: signal.length,
        nonMonotone: false,
        jointWitness: [],
      })
    }
  }

  // A single deletion showing no movement is not a reason the engine ignores: two reasons jointly
  // necessary and individually removable each look exactly like this. So every candidate is
  // re-decided against the joint deletions, and none stays `deleted` unless that search finished.
  let search: DeletionSearch | null = null
  if (verdicts.some((v) => v.status === "deleted")) {
    const resolved = resolveJointly(
      artifact,
      verdicts,
      seen,
      singletonMoved,
      engineValue,
      tol,
      budget,
    )
    verdicts = resolved.verdicts
    search = resolved.search
  }

  return {
    query: artifact.query,
    adapterName: artifact.engineName,
    claimedSemantics: artifact.claimedSemantics,
    exactDepth: artifact.exactDepth,
    exactValue,
    engineValue,
    tol,
    verdicts,
    attribution: attribute(verdicts, engineValue - exactValue, tol),
    exactInference: artifact.exactInference,
    monotone: artifact.monotone,
    search,
  }
}

/** Inferences this certificate replayed: one baseline, plus every fact and joint pattern probed. */
export function probeCount(cert: Certificate): number {
  return (
    1 +
    cert.verdicts.reduce((total, v) => total + v.engineProbes, 0) +
    (cert.search ? cert.search.probes : 0)
  )
}
