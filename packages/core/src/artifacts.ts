/**
 * What a reason-bearing inference artefact is, and the one premise the deletion probe rests on.
 *
 * Ported from `src/reasonsmith/artifacts/__init__.py`. The reason-deletion probe is
 * **one-directional** — it switches a fact off, never on — so `deleted` means *the answer did not
 * depend on this reason under this interpretation*, and on an engine that is not monotone in its
 * inputs a lawfully retracted reason is indistinguishable from a dropped one. That premise is
 * **declared rather than assumed**: `monotone` is required, has no default of `true`, and an
 * artefact that says nothing is refused rather than measured and explained away.
 *
 * A recounted reason set does not reach the enumerated rung. A family that enumerates says so with
 * `reasonsAreExact = true`; **silence claims the weaker rung** — the opposite default from
 * `monotone`, because guessing monotone accuses a compliant system while guessing recounted only
 * understates one.
 */

/** The declaration key on the mapping form of an artefact. */
export const MONOTONE_KEY = "monotone"

/** The declaration key a family sets to claim an enumerated reason set. */
export const EXACT_REASONS_KEY = "reasonsAreExact"

export const RECOUNTED_REASONS =
  "the reason set is the one the system recounted for this decision rather than one enumerated " +
  "from a model encoding, so a reason the system never recounted was never probed and this " +
  "measurement is a lower bound on what its inference used"

export const DECLARED_NON_MONOTONE =
  "the artefact declares its inference non-monotone, and the deletion probe only ever switches a " +
  "fact off. On a non-monotone inference a reason the system lawfully retracted is " +
  "indistinguishable from one it dropped, so a count measured this way is not evidence about the " +
  "notice"

export const UNDECLARED_MONOTONICITY =
  "the artefact declares nothing about whether its inference is monotone, and the deletion " +
  "definition of a reason needs that premise. A defeasible inference and a monotone one produce " +
  "the same probe and the same count, so the declaration is required rather than defaulted"

export const DECLARATION_REFUTED =
  "the artefact declares its inference monotone, and switching a fact off raised the system's own " +
  "answer. A deletion that raises an answer is the one fingerprint a non-monotone inference " +
  "leaves, so the measurement refutes the declaration and nothing is claimed from it"

/**
 * Why the deletion definition of a reason does not apply to this artefact, or null when it does.
 *
 * Three states reach it: an artefact declaring non-monotone, one declaring nothing, and one
 * declaring itself monotone that the probe then contradicted. The third can only ever *refute* a
 * declaration and never confirm one — a defeater holding no fact of any enumerated reason is never
 * switched off at all.
 */
export function deletionSemanticsRefusal(
  monotone: boolean | null | undefined,
  options: { refutedByMeasurement?: boolean } = {},
): string | null {
  if (monotone === false) return DECLARED_NON_MONOTONE
  if (monotone === null || monotone === undefined) return UNDECLARED_MONOTONICITY
  if (options.refutedByMeasurement) return DECLARATION_REFUTED
  return null
}

/** A reason, as the set of evidence facts supporting it. Facts are compared by their string key. */
export type Fact = string

/** Whether this artefact's reason set was enumerated. Silence claims the weaker rung. */
export function reasonSetIsExact(artifact: { reasonsAreExact?: boolean }): boolean {
  return artifact.reasonsAreExact === true
}

/** A reason with no label of its own, named by the facts that support it. */
export function defaultLabel(reason: ReadonlySet<Fact>): string {
  return [...reason].sort().join(" ∧ ")
}

/**
 * The inference behind one decision, as much of it as the probe needs.
 *
 * `without(fact)` is the *only* perturbation there is, and it re-scores the reasons the base
 * enumeration found rather than enumerating again: the probe compares exact inference's answer
 * before and after one fact is switched off, and enumerating again would compare two answers to two
 * questions.
 */
export interface InferenceArtifact {
  /** True when the reason set was enumerated from a model encoding rather than recounted. */
  readonly reasonsAreExact?: boolean
  /** The monotonicity declaration. Required in substance: `null`/absent is refused, never assumed. */
  readonly monotone: boolean | null
  readonly query: string
  /** The engine that answered, by name. */
  readonly engineName: string
  /** The semantics that engine claims for itself. */
  readonly claimedSemantics: string
  /** How exact inference was computed, in words, for the certificate to quote. */
  readonly exactInference: string
  /** The bound the enumeration ran to, or null when the family has none. */
  readonly exactDepth: number | null
  /** Every reason, as a set of facts. */
  reasons(): readonly ReadonlySet<Fact>[]
  label(reason: ReadonlySet<Fact>): string
  score(reason: ReadonlySet<Fact>): number
  /** Exact inference's answer. */
  exactValue(): number
  /** The deployed engine's answer. */
  engineValue(): number
  /** The same inference with `fact` switched off. */
  without(fact: Fact): InferenceArtifact
}
