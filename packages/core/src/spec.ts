/**
 * Specification structures and pack loader.
 *
 * Ported from `src/reasonsmith/spec.py`. `REQUIREMENT_FIELDS` is exact: a pack that omits or adds a
 * field to a requirement block is refused at load time, and the `spec` is parsed, classified and
 * matched against the declared `formalism` so prose can no longer sit in a field that means
 * something executable. `binding`, `scope` and `domains` are required fields with no default.
 */

import {
  type DecisionRecord,
  FRAGMENTS,
  type Formalism,
  type Expr,
  classifyFragment,
  parseProperty,
  unconditionalSignalNames,
  validateProperty,
} from "./language.ts"

export const REQUIREMENT_FIELDS = [
  "id",
  "source_document",
  "article_clause",
  "verbatim_text",
  "stakeholder",
  "formalism",
  "spec",
  "rationale",
  "requires",
  "binding",
  "scope",
  "domains",
  "deontic_type",
  "defeasibility",
] as const

export const DEONTIC_TYPES = ["obligation", "permission", "prohibition", "reparation"] as const

export const DEFEASIBILITY_CLASSES = [
  "strict",
  "defeasible-modelled",
  "defeasible-unmodelled",
  "trigger-unmodelled",
] as const

export const REGULATORY_CLASSES = [
  "prohibited",
  "high-risk",
  "limited-risk",
  "minimal-risk",
  "general-purpose",
] as const

export const DECISION_DOMAINS = [
  "consumer-credit",
  "criminal-justice",
  "education",
  "employment",
  "healthcare",
  "housing",
  "insurance",
  "public-services",
] as const

/**
 * Normalize a regulatory class: surrounding whitespace and letter case only, refused when outside
 * the vocabulary. "" (None/empty) means "not class-limited" on a requirement and "undeclared" on a
 * system.
 */
export function normalizeScope(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value !== "string")
    throw new TypeError(`a regulatory class must be a string or null, got ${typeof value}`)
  if (!value) return ""
  const normalized = value.trim().toLowerCase()
  if (!(REGULATORY_CLASSES as readonly string[]).includes(normalized)) {
    throw new Error(
      `${JSON.stringify(value)} is not a known regulatory class. Accepted: ${REGULATORY_CLASSES.join(", ")}`,
    )
  }
  return normalized
}

/** Normalize one decision domain, refusing an empty name. */
export function normalizeDomain(value: unknown): string {
  if (typeof value !== "string")
    throw new TypeError(`a decision domain must be a string, got ${typeof value}`)
  const normalized = value.trim().toLowerCase()
  if (!(DECISION_DOMAINS as readonly string[]).includes(normalized)) {
    throw new Error(
      `${JSON.stringify(value)} is not a known decision domain. Accepted: ${DECISION_DOMAINS.join(", ")}`,
    )
  }
  return normalized
}

/** Normalize a collection of decision domains, sorted and deduplicated. `[]` means not domain-limited. */
export function normalizeDomains(value: unknown): readonly string[] {
  if (value === null || value === undefined) return []
  if (typeof value === "string")
    throw new TypeError(`a decision-domain list must be a collection, not a single string`)
  if (Array.isArray(value) === false && typeof value === "object")
    throw new TypeError(`a decision-domain list must be an array of names, not a map`)
  if (!Array.isArray(value)) throw new TypeError(`a decision-domain list must be an array`)
  const names = value.map((item) => normalizeDomain(item))
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i)
  if (duplicates.length > 0) {
    throw new Error(`duplicate decision domain(s): ${[...new Set(duplicates)].join(", ")}`)
  }
  return [...new Set(names)].sort()
}

export interface RequirementInit {
  id: string
  source_document: string
  article_clause: string
  verbatim_text: string
  stakeholder: string
  formalism: string
  spec: string
  rationale: string
  requires: readonly string[]
  binding: boolean
  scope: string
  domains: readonly string[]
  deontic_type: string
  defeasibility: string
  algebra?: string
}

export class Requirement {
  readonly id: string
  readonly source_document: string
  readonly article_clause: string
  readonly verbatim_text: string
  readonly stakeholder: string
  readonly formalism: Formalism
  readonly spec: string
  readonly rationale: string
  readonly requires: readonly string[]
  readonly binding: boolean
  readonly scope: string
  readonly domains: readonly string[]
  readonly deontic_type: string
  readonly defeasibility: string
  readonly algebra: string
  /** The parsed property, so engines do not parse it twice. */
  readonly property: Expr

  constructor(init: RequirementInit) {
    this.id = init.id
    this.source_document = init.source_document
    this.article_clause = init.article_clause
    this.verbatim_text = init.verbatim_text
    this.stakeholder = init.stakeholder
    this.spec = init.spec
    this.rationale = init.rationale
    this.requires = [...init.requires]
    this.binding = init.binding
    this.scope = normalizeScope(init.scope)
    this.domains = normalizeDomains(init.domains)
    this.deontic_type = init.deontic_type
    this.defeasibility = init.defeasibility

    const id = this.id
    if (typeof init.binding !== "boolean")
      throw new Error(`Requirement ${JSON.stringify(id)}: field 'binding' must be a boolean`)
    if (!(FRAGMENTS as readonly string[]).includes(init.formalism as Formalism)) {
      throw new Error(
        `Requirement ${JSON.stringify(id)}: invalid formalism ${JSON.stringify(init.formalism)}; must be one of ${FRAGMENTS.join(", ")}`,
      )
    }
    this.formalism = init.formalism as Formalism
    if (!(DEONTIC_TYPES as readonly string[]).includes(this.deontic_type)) {
      throw new Error(
        `Requirement ${JSON.stringify(id)}: field 'deontic_type' is ${JSON.stringify(this.deontic_type)}, ` +
          `not one of ${DEONTIC_TYPES.join(", ")}`,
      )
    }
    if (!(DEFEASIBILITY_CLASSES as readonly string[]).includes(this.defeasibility)) {
      throw new Error(
        `Requirement ${JSON.stringify(id)}: field 'defeasibility' is ${JSON.stringify(this.defeasibility)}, ` +
          `not one of ${DEFEASIBILITY_CLASSES.join(", ")}`,
      )
    }
    for (const field of ["id", "source_document", "article_clause", "verbatim_text", "stakeholder", "spec", "rationale"] as const) {
      const value = (this as unknown as Record<string, string>)[field]
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Requirement ${JSON.stringify(id)}: field ${JSON.stringify(field)} must be a non-empty string`)
      }
    }
    if (this.requires.length === 0)
      throw new Error(`Requirement ${JSON.stringify(id)} must specify at least one required signal`)
    for (const signal of this.requires) {
      if (typeof signal !== "string" || !signal.trim()) {
        throw new Error(`Requirement ${JSON.stringify(id)}: 'requires' entries must be non-empty signal names`)
      }
    }
    if (new Set(this.requires).size !== this.requires.length) {
      throw new Error(`Requirement ${JSON.stringify(id)}: 'requires' contains duplicate signal names`)
    }

    // The algebra: graded duties must declare one, other duties must not carry one.
    const algebra = (init.algebra ?? "").trim().toLowerCase()
    this.algebra = algebra
    if (this.formalism === "graded") {
      if (!algebra) {
        throw new Error(
          `Requirement ${JSON.stringify(id)} is a graded duty and declares no algebra; see [grading] algebra`,
        )
      }
    } else if (algebra) {
      throw new Error(
        `Requirement ${JSON.stringify(id)} declares algebra ${JSON.stringify(algebra)} but its ` +
          `formalism is ${this.formalism}, which is two-valued`,
      )
    }

    // Parse and classify the spec; the fragment must match exactly.
    let node: Expr
    try {
      // `parseProperty` refuses every construct outside the language; the side conditions are part
      // of it, so there is no second call to forget.
      node = parseProperty(this.spec)
    } catch (err) {
      if (err instanceof Error && "kind" in (err as object)) {
        throw new Error(
          `Requirement ${JSON.stringify(id)}: field 'spec': ${err.message}`,
        )
      }
      throw err
    }
    const found = classifyFragment(node)
    if (found !== this.formalism) {
      throw new Error(
        `Requirement ${JSON.stringify(id)}: declares formalism ${JSON.stringify(this.formalism)} ` +
          `but its spec is a ${JSON.stringify(found)} property. Either declare ${JSON.stringify(found)}, ` +
          `or write a ${JSON.stringify(this.formalism)} property`,
      )
    }
    const unrequired = unconditionalSignalNames(node).filter((n) => !this.requires.includes(n))
    if (unrequired.length > 0) {
      throw new Error(
        `Requirement ${JSON.stringify(id)}: field 'spec' reads signal(s) not named in 'requires': ` +
          unrequired.join(", ") +
          `. requires is the capability gate; only a signal standing for one branch of an either/or is exempt`,
      )
    }
    this.property = node
  }

  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      source_document: this.source_document,
      article_clause: this.article_clause,
      verbatim_text: this.verbatim_text,
      stakeholder: this.stakeholder,
      formalism: this.formalism,
      spec: this.spec,
      rationale: this.rationale,
      requires: [...this.requires],
      binding: this.binding,
      scope: this.scope,
      domains: [...this.domains],
      deontic_type: this.deontic_type,
      defeasibility: this.defeasibility,
      algebra: this.algebra,
    }
  }
}

export interface PackInit {
  id: string
  title: string
  description: string
  requirements: readonly (Requirement | RequirementInit)[]
  source_metadata?: Record<string, unknown>
  algebra?: string
}

export class Pack {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly requirements: readonly Requirement[]
  readonly source_metadata: Readonly<Record<string, unknown>>
  readonly algebra: string

  constructor(init: PackInit) {
    this.id = init.id
    this.title = init.title
    this.description = init.description
    this.source_metadata = init.source_metadata ?? {}
    this.algebra = (init.algebra ?? "").trim().toLowerCase()
    this.requirements = init.requirements.map((r) =>
      r instanceof Requirement ? r : new Requirement(r),
    )
    if (this.requirements.length === 0)
      throw new Error(`Pack ${JSON.stringify(this.id)} contains no requirements`)
    const ids = this.requirements.map((r) => r.id)
    const duplicates = ids.filter((x, i) => ids.indexOf(x) !== i)
    if (duplicates.length > 0) {
      throw new Error(
        `Pack ${JSON.stringify(this.id)} has duplicate requirement id(s): ${[...new Set(duplicates)].join(", ")}`,
      )
    }
  }

  getRequirement(reqId: string): Requirement {
    const found = this.requirements.find((r) => r.id === reqId)
    if (!found) throw new Error(`Requirement ${JSON.stringify(reqId)} not found in pack ${JSON.stringify(this.id)}`)
    return found
  }

  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      requirements: this.requirements.map((r) => r.toDict()),
      source_metadata: { ...this.source_metadata },
      algebra: this.algebra,
    }
  }
}

export type PackSource = "builtin"

/** Built-in packs registered with the loader. */
export const BUILTIN_PACKS: Record<string, () => Pack> = {}

export function registerPack(name: string, factory: () => Pack): void {
  BUILTIN_PACKS[name] = factory
}

/**
 * Load a pack by name. The built-in registry is checked first (mirroring `PACKS_DIR`); a name that
 * is not built in is refused with the list of what is available.
 */
export function loadPack(nameOrPath: string): Pack {
  const name = nameOrPath.replace(/\.toml$/, "")
  const factory = BUILTIN_PACKS[name]
  if (!factory) {
    const known = Object.keys(BUILTIN_PACKS)
    throw new Error(
      `Pack file not found: ${nameOrPath}. Built-in packs: ${known.join(", ") || "none"}`,
    )
  }
  return factory()
}

export function listPacks(): readonly string[] {
  return Object.keys(BUILTIN_PACKS).sort()
}

/** A decision record: one row of a decision log. */
export type { DecisionRecord }
