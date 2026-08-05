/**
 * The evidence strength lattice, the evidence basis, and the verdict vocabulary.
 *
 * Ported from `src/reasonsmith/verdict.py`. The model is the same:
 *
 *   - `Strength` is a strict total order: `unattainable < observed < recounted < probed < proved`.
 *   - `EvidenceBasis` is a *classification and never a rank*. Its members carry no order and
 *     cannot be compared, because the chain ranks how far a claim about one kind of object was
 *     pushed while the basis says which kind of object.
 *   - `BASIS_RUNGS` is the rungs each basis admits, read off what an engine can actually reach.
 *   - `Verdict` is `satisfied` / `violated` / `inconclusive` / `not_applicable`, and combining
 *     verdicts uses worst-case propagation.
 *
 * Nothing here asserts legal compliance; these are evidence records checked against a spec.
 */

/** Evidence strength in the reasonsmith lattice, weakest first. */
export const STRENGTHS = ["unattainable", "observed", "recounted", "probed", "proved"] as const
export type Strength = (typeof STRENGTHS)[number]

export const STRENGTH_RANK: Record<Strength, number> = {
  unattainable: 0,
  observed: 1,
  recounted: 2,
  probed: 3,
  proved: 4,
}

/** Names a strength; throws on anything outside the lattice. */
export function parseStrength(value: string): Strength {
  const v = value.trim().toLowerCase() as Strength
  if (!(v in STRENGTH_RANK)) {
    throw new Error(`Unknown strength ${JSON.stringify(value)}; valid: ${STRENGTHS.join(", ")}`)
  }
  return v
}

export function isStrength(value: unknown): value is Strength {
  return typeof value === "string" && value in STRENGTH_RANK
}

/** The strict total order of the strength lattice (<). */
export function ltStrength(a: Strength, b: Strength): boolean {
  return STRENGTH_RANK[a] < STRENGTH_RANK[b]
}

/** Weakest strength in a collection (weakest-link). Empty throws. */
export function minStrength(strengths: readonly Strength[]): Strength {
  if (strengths.length === 0) throw new Error("Cannot compute minStrength of an empty collection")
  return strengths.reduce((min, s) => (STRENGTH_RANK[s] < STRENGTH_RANK[min] ? s : min))
}

/** Strongest strength in a collection. Empty throws. */
export function maxStrength(strengths: readonly Strength[]): Strength {
  if (strengths.length === 0) throw new Error("Cannot compute maxStrength of an empty collection")
  return strengths.reduce((max, s) => (STRENGTH_RANK[s] > STRENGTH_RANK[max] ? s : max))
}

/** What kind of thing a duty's evidence is about — the second coordinate beside strength. */
export const BASISES = ["behavioural", "relational", "artifact", "assessment"] as const
export type EvidenceBasis = (typeof BASISES)[number]

export function parseBasis(value: string): EvidenceBasis {
  const v = value.trim().toLowerCase() as EvidenceBasis
  if (!(BASISES as readonly string[]).includes(v)) {
    throw new Error(`Unknown evidence basis ${JSON.stringify(value)}; valid: ${BASISES.join(", ")}`)
  }
  return v
}

/** The rungs each basis admits, weakest first. */
export const BASIS_RUNGS: Record<EvidenceBasis, readonly Strength[]> = {
  // behavioural: a trace property — all four rungs reachable.
  behavioural: ["unattainable", "observed", "probed", "proved"],
  // relational: a 2-safety property — no trace rung, ever.
  relational: ["unattainable", "probed", "proved"],
  // artifact: evidence about the inference behind a decision — observed and proved are off.
  artifact: ["unattainable", "recounted", "probed"],
  // assessment: a truth degree supplied by a named authority — no rung at all.
  assessment: ["unattainable"],
}

export function basisAdmits(basis: EvidenceBasis, strength: Strength): boolean {
  return BASIS_RUNGS[basis].includes(strength)
}

/** Verdict on whether a requirement is satisfied. */
export const VERDICTS = ["satisfied", "violated", "inconclusive", "not_applicable"] as const
export type Verdict = (typeof VERDICTS)[number]

export function parseVerdict(value: string): Verdict {
  const v = value.trim().toLowerCase().replaceAll(" ", "_") as Verdict
  if (!(VERDICTS as readonly string[]).includes(v)) {
    throw new Error(`Unknown verdict ${JSON.stringify(value)}; valid: ${VERDICTS.join(", ")}`)
  }
  return v
}

export const isVerdict = (value: unknown): value is Verdict =>
  typeof value === "string" && (VERDICTS as readonly string[]).includes(value)

/**
 * Combine multiple verdicts using worst-case propagation.
 *
 *   1. any VIOLATED -> VIOLATED
 *   2. else any INCONCLUSIVE -> INCONCLUSIVE
 *   3. else all NOT_APPLICABLE -> NOT_APPLICABLE
 *   4. else the remaining SATISFIED/NOT_APPLICABLE -> SATISFIED
 *   5. empty -> INCONCLUSIVE (deliberately not vacuous truth: having checked nothing is not
 *      evidence that a requirement holds).
 */
export function combineVerdicts(verdicts: readonly (Verdict | string)[]): Verdict {
  const v = verdicts.map(parseVerdict)
  if (v.length === 0) return "inconclusive"
  if (v.some((x) => x === "violated")) return "violated"
  if (v.some((x) => x === "inconclusive")) return "inconclusive"
  if (v.every((x) => x === "not_applicable")) return "not_applicable"
  return "satisfied"
}