/**
 * The one property language of reasonsmith, and the reference interpreter over a decision record.
 *
 * Ported from `src/reasonsmith/rulelang.py`. A requirement's `spec` is a formula in this language;
 * `formalism` names which fragment of it the formula belongs to, and the loader refuses a mismatch.
 *
 * The language:
 *   - atom calls with a *signal name* first argument: `present(name)`, `contains(name, "lit")`,
 *     `counterfactually_invariant(outcome, protected)`, `undetermined(name, "p", "authority")`,
 *     `degree(name, "p")`.
 *   - boolean connectives: `Implies(a, b)` / `implies(a, b)`, `Iff(a, b)`, `not x`, `x and y`,
 *     `x or y`.
 *   - the arrow spellings `->`, `=>`, ` implies ` map to `Implies` (right-associative); the
 *     equivalents `<=>` / `<->` map to `Iff`, the outermost connective, and chained equivalence is
 *     refused rather than guessed.
 *   - comparisons (`<`, `<=`, `>`, `>=`, `==`, `!=`), arithmetic (`+ - * / %`), numeric literals
 *     and bare names (read as numbers or Booleans from the record).
 *   - the prefix-call temporal operators `always(f)`, `eventually(f)`, `once`, `historically`,
 *     `next`, `prev`, `rise`, `fall`, and the two binary `until(l, r)` / `since(l, r)`.
 *
 * Nothing here may execute arbitrary code: the parser is the interpreter, exactly as the Python
 * port refuses `eval`. The whitelist *is* the tokenizer + grammar in this file.
 */

/** Errors the language refuses, equivalent to `UnsupportedConstructError`. */
export class UnsupportedConstructError extends Error {
  readonly kind = "UnsupportedConstructError"
}

/**
 * The refusal `contains()` raises when a present value is not a statement (a number or a mapping),
 * so an engine can report it NOT EVALUATED on the strength ordering rather than fold it into a
 * false answer. Mirrors `NotAStatementError`.
 */
export class NotAStatementError extends UnsupportedConstructError {
  readonly notAStatement = true
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type Expr =
  | { kind: "name"; name: string }
  | { kind: "bool"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "none" }
  | { kind: "not"; operand: Expr }
  | { kind: "unary"; op: "neg" | "pos"; operand: Expr }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "%"; left: Expr; right: Expr }
  | { kind: "compare"; op: "==" | "!=" | "<" | "<=" | ">" | ">="; left: Expr; right: Expr }
  | { kind: "and"; values: readonly Expr[] }
  | { kind: "or"; values: readonly Expr[] }
  | { kind: "call"; name: string; args: readonly Expr[] }

export const PRESENCE_CALL = "present"
export const CONTAINS_CALL = "contains"
export const COUNTERFACTUAL_CALL = "counterfactually_invariant"
export const UNDETERMINED_CALL = "undetermined"
export const DEGREE_CALL = "degree"
export const EQUIVALENCE_CALL = "Iff"
export const IMPLICATION_CALLS = ["implies", "Implies"] as const

export const UNARY_TEMPORAL_OPERATORS = [
  "always",
  "eventually",
  "once",
  "historically",
  "next",
  "prev",
  "rise",
  "fall",
] as const
export const BINARY_TEMPORAL_OPERATORS = ["until", "since"] as const
export const TEMPORAL_OPERATORS: readonly string[] = [
  ...UNARY_TEMPORAL_OPERATORS,
  ...BINARY_TEMPORAL_OPERATORS,
]
/** The one temporal shape that reduces to a state property, and so reaches the proof rung. */
export const ALWAYS_OPERATOR = "always"

/** Non-temporal function calls with thier arity. */
export const VALUE_CALLS: Record<string, number> = {
  implies: 2,
  Implies: 2,
  Iff: 2,
  abs: 1,
  min: 2,
  max: 2,
}

/** The fragments of the language, narrowest first (mirrors FRAGMENTS). */
export const FRAGMENTS = ["record", "logical", "temporal", "counterfactual", "undetermined", "graded"] as const
export type Formalism = (typeof FRAGMENTS)[number]

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { type: "name"; value: string }
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "op"; value: string } // multi-char ops and punctuation/symbols
  | { type: "eof" }

const IFF_TOKENS = new Set(["<=>", "<->"])
const ARROW_TOKENS = new Set(["=>", "->"])
const SINGLE_TOKEN_OPS = new Set("()+-*/%,<>=".split(""))

function isIdentStart(c: string): boolean {
  return /[A-Za-z_]/.test(c)
}
function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c)
}

/** Tokenize spec text. Throws UnsupportedConstructError on unknown characters. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  const src = text
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (isIdentStart(c)) {
      let j = i
      while (j < src.length && isIdentPart(src[j])) j++
      const word = src.slice(i, j)
      // A bare `implies` where an expression is expected is the infix arrow ` implies `
      // (rewritten in Python as `->`); we keep it as a name and let the parser treat the word
      // `implies` as an infix arrow when it appears between operands.
      tokens.push({ type: "name", value: word })
      i = j
      continue
    }
    if (c === "'" || c === '"') {
      const quote = c
      let j = i + 1
      let value = ""
      while (j < src.length) {
        const ch = src[j]
        if (ch === "\\") {
          if (j + 1 >= src.length) throw new UnsupportedConstructError("Unterminated string literal")
          const n = src[j + 1]
          value += n === "n" ? "\n" : n === "t" ? "\t" : n === "\\" ? "\\" : n
          j += 2
          continue
        }
        if (ch === quote) break
        value += ch
        j++
      }
      if (j >= src.length || src[j] !== quote)
        throw new UnsupportedConstructError(`Unterminated string literal in ${JSON.stringify(text)}`)
      tokens.push({ type: "string", value })
      i = j + 1
      continue
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i
      let seenDot = false
      while (j < src.length) {
        const n = src[j]
        if (/[0-9]/.test(n)) {
          j++
        } else if (n === "." && !seenDot && /[0-9]/.test(src[j + 1] ?? "") === true) {
          seenDot = true
          j++
        } else {
          break
        }
      }
      const raw = src.slice(i, j)
      if (!/^[0-9]+(\.[0-9]+)?$/.test(raw)) throw new UnsupportedConstructError(`Bad number ${JSON.stringify(raw)}`)
      tokens.push({ type: "number", value: parseFloat(raw) })
      i = j
      continue
    }
    // Multi-char operators.
    const three = src.slice(i, i + 3)
    const two = src.slice(i, i + 2)
    if (["<=>", "<->"].includes(three)) {
      tokens.push({ type: "op", value: three })
      i += 3
      continue
    }
    if (["=>", "->", "<=", ">=", "==", "!="].includes(two)) {
      tokens.push({ type: "op", value: two })
      i += 2
      continue
    }
    if (SINGLE_TOKEN_OPS.has(c)) {
      tokens.push({ type: "op", value: c })
      i++
      continue
    }
    throw new UnsupportedConstructError(
      `Unsupported character ${JSON.stringify(c)} in ${JSON.stringify(text)}`,
    )
  }
  tokens.push({ type: "eof" })
  return tokens
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos]
  }
  private advance(): Token {
    const t = this.tokens[this.pos]
    if (t.type !== "eof") this.pos++
    return t
  }
  private isOp(v: string): boolean {
    const t = this.peek()
    return t.type === "op" && t.value === v
  }
  private matchName(v: string): boolean {
    const t = this.peek()
    return t.type === "name" && t.value === v
  }
  private eatOp(v: string): boolean {
    if (this.isOp(v)) {
      this.advance()
      return true
    }
    return false
  }
  /** The word `implies` used as an infix arrow, matching the ` implies ` spelling. */
  private isInfixImplies(): boolean {
    if (this.matchName("implies")) {
      // Only meaningful as an infix arrow when it is not the start of a call `implies(`.
      const next = this.tokens[this.pos + 1]
      return !(next.type === "op" && next.value === "(")
    }
    return false
  }

  parse(): Expr {
    const e = this.parseExpr(false)
    const t = this.tokens[this.pos]
    if (t.type !== "eof") {
      throw new UnsupportedConstructError(`Unexpected trailing tokens after expression at ${t.value}`)
    }
    return e
  }

  /** The top-level connectives: equivalence (outermost, chained refused) then implication. */
  private parseExpr(seenIff: boolean): Expr {
    let node: Expr = this.parseOr()
    while (true) {
      const t = this.peek()
      if (t.type === "op" && IFF_TOKENS.has(t.value)) {
        if (seenIff) {
          throw new UnsupportedConstructError(
            "Chained equivalence is ambiguous: parenthesise one side (a <=> b <=> c)",
          )
        }
        this.advance()
        const right = this.parseOr()
        node = { kind: "call", name: EQUIVALENCE_CALL, args: [node, right] }
        seenIff = true
        // an Iff is outermost; a following arrow within the same side would have bound inside
        // `right`, so the loop stops rechecking equivalence chains below.
        continue
      }
      if ((t.type === "op" && ARROW_TOKENS.has(t.value)) || this.isInfixImplies()) {
        this.advance()
        // right-associative
        const right = this.parseOr()
        node = { kind: "call", name: "Implies", args: [node, right] }
        continue
      }
      return node
    }
  }

  private parseOr(): Expr {
    let node: Expr = this.parseAnd()
    while (this.matchName("or")) {
      this.advance()
      const right = this.parseAnd()
      node =
        node.kind === "or"
          ? { kind: "or", values: [...node.values, right] }
          : { kind: "or", values: [node, right] }
    }
    return node
  }

  private parseAnd(): Expr {
    let node: Expr = this.parseNot()
    while (this.matchName("and")) {
      this.advance()
      const right = this.parseNot()
      node =
        node.kind === "and"
          ? { kind: "and", values: [...node.values, right] }
          : { kind: "and", values: [node, right] }
    }
    return node
  }

  private parseNot(): Expr {
    if (this.matchName("not")) {
      this.advance()
      return { kind: "not", operand: this.parseNot() }
    }
    return this.parseComparison()
  }

  private parseComparison(): Expr {
    const left = this.parseAdditive()
    const t = this.peek()
    if (t.type === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(t.value)) {
      this.advance()
      const right = this.parseAdditive()
      return { kind: "compare", op: t.value as never, left, right }
    }
    return left
  }

  private parseAdditive(): Expr {
    let node = this.parseMultiplicative()
    while (true) {
      if (this.eatOp("+")) {
        node = { kind: "binary", op: "+", left: node, right: this.parseMultiplicative() }
      } else if (this.eatOp("-")) {
        node = { kind: "binary", op: "-", left: node, right: this.parseMultiplicative() }
      } else {
        return node
      }
    }
  }

  private parseMultiplicative(): Expr {
    let node = this.parseUnary()
    while (true) {
      const t = this.peek()
      if (t.type === "op" && ["*", "/", "%"].includes(t.value)) {
        this.advance()
        node = { kind: "binary", op: t.value as never, left: node, right: this.parseUnary() }
      } else {
        return node
      }
    }
  }

  private parseUnary(): Expr {
    const t = this.peek()
    if (t.type === "op" && (t.value === "-" || t.value === "+")) {
      this.advance()
      return { kind: "unary", op: t.value === "-" ? "neg" : "pos", operand: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Expr {
    const t = this.peek()
    if (t.type === "number") {
      this.advance()
      return { kind: "number", value: t.value }
    }
    if (t.type === "string") {
      this.advance()
      return { kind: "string", value: t.value }
    }
    if (t.type === "op" && t.value === "(") {
      this.advance()
      const inner = this.parseExpr(false)
      if (!this.eatOp(")")) {
        throw new UnsupportedConstructError("Unbalanced parentheses: missing ')'")
      }
      return inner
    }
    if (t.type === "name") {
      const name = t.value
      this.advance()
      // `True`/`False` in the Python spelling as well as the lowercase one: a spec is written in a
      // Python-flavoured syntax, and a pack author who typed `True` must meet the refusal for a
      // bare Boolean constant rather than have it read as a signal named "True".
      if (name === "true" || name === "True") return { kind: "bool", value: true }
      if (name === "false" || name === "False") return { kind: "bool", value: false }
      if (name === "None" || name === "null") return { kind: "none" }
      if (this.isOp("(")) {
        this.advance()
        const args: Expr[] = []
        if (!this.isOp(")")) {
          while (true) {
            args.push(this.parseExpr(false))
            if (this.eatOp(",")) continue
            break
          }
        }
        if (!this.eatOp(")")) throw new UnsupportedConstructError(`Missing ')' in call ${name}(...)`)
        return { kind: "call", name, args }
      }
      return { kind: "name", name }
    }
    throw new UnsupportedConstructError(
      `Unexpected token ${JSON.stringify(t.type === "eof" ? "end of spec" : t.value)}`,
    )
  }
}

/**
 * Parse text as an expression, and nothing more. Answers only whether this grammar could read it.
 *
 * `parseProperty` is the gate a requirement passes; this is the escape hatch for a caller that
 * genuinely wants the syntax without the side conditions. There is exactly one such caller in the
 * Python and there should not be a second here.
 */
export function parseExpression(text: string): Expr {
  return new Parser(tokenize(preprocessSpec(text))).parse()
}

/**
 * Parse a requirement `spec` and refuse every construct outside this language.
 *
 * **The refusals are part of parsing, not a separate step a caller may forget.** `parseExpression`
 * answers only whether the grammar could read the text; this is the gate, and it refuses prose, a
 * `present()` given anything but a signal name, a `degree()` under a temporal operator, the
 * relational atom anywhere but as the whole spec, and every other side condition — naming what it
 * found. A `spec` that is prose can no longer sit in a field that means something executable.
 *
 * Splitting the two was a defect, not a design: the callers that reach for the AST outside the pack
 * loader (the counterfactual atom, the open-texture atoms) would each have had to remember to
 * validate, and one that forgot would read a shape the language refuses.
 */
export function parseProperty(text: string): Expr {
  const node = parseExpression(text)
  validateProperty(node)
  return node
}

/** Normalise arrow spellings; for the TS parser the arrows are handled inline, so this is thin. */
export function preprocessSpec(text: string): string {
  return text.trim()
}

// ---------------------------------------------------------------------------
// Value semantics shared by contains / present
// ---------------------------------------------------------------------------

const ASCII_UPPER = /[A-Z]/

/** Lowercase the twenty-six ASCII capitals and change nothing else. */
export function foldAsciiCase(text: string): string {
  let out = ""
  for (const ch of text) {
    out += ASCII_UPPER.test(ch) ? ch.toLowerCase() : ch
  }
  return out
}

/** True when a trace value carries something, not merely a key. */
export function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (value instanceof Map) return value.size > 0
  if (value instanceof Set) return value.size > 0
  return true
}

/**
 * Whether a recorded value carries a phrase, folding ASCII case on both sides.
 * A list of strings is a statement given in parts: one part bearing the phrase is a match.
 * A present non-statement raises NotAStatementError so an engine reports it NOT EVALUATED.
 */
export function containsLiteral(haystack: unknown, needle: string): boolean {
  if (!isPresent(haystack)) return false
  const foldedNeedle = foldAsciiCase(needle)
  if (typeof haystack === "string") return foldAsciiCase(haystack).includes(foldedNeedle)
  if (Array.isArray(haystack) && haystack.every((p) => typeof p === "string")) {
    return haystack.some((p) => foldAsciiCase(p).includes(foldedNeedle))
  }
  throw new NotAStatementError(
    `contains() reads a recorded statement — text, or a list of text given in parts — but this ` +
      `decision carries ${Object.prototype.toString.call(haystack)} ${JSON.stringify(haystack)}.`,
  )
}

// ---------------------------------------------------------------------------
// Walkers: atoms, signal names, role checks
// ---------------------------------------------------------------------------

/** Every node of an expression, the node itself first. Exported as `walkExpr`. */
export function walkExpr(node: Expr): readonly Expr[] {
  return walk(node)
}

function walk(node: Expr): readonly Expr[] {
  const out: Expr[] = []
  const stack = [node]
  while (stack.length) {
    const cur = stack.pop() as Expr
    out.push(cur)
    switch (cur.kind) {
      case "not":
      case "unary":
        stack.push(cur.operand)
        break
      case "binary":
      case "compare":
        stack.push(cur.left, cur.right)
        break
      case "and":
      case "or":
        stack.push(...cur.values)
        break
      case "call":
        stack.push(...cur.args)
        break
      default:
        break
    }
  }
  return out
}

export function atomCalls(node: Expr, name: string): readonly Expr[] {
  return walk(node).filter((e) => e.kind === "call" && e.name === name)
}

export function hasAtom(node: Expr, name: string): boolean {
  return atomCalls(node, name).length > 0
}

export function literalArgs(call: Expr, roles: readonly string[]): string[] {
  if (call.kind !== "call") throw new UnsupportedConstructError("expected a call")
  if (call.args.length !== 1 + roles.length) {
    throw new UnsupportedConstructError(
      `${call.name}() takes a signal name and ${roles.join(", ")}: unexpected arity`,
    )
  }
  const signal = call.args[0]
  if (signal.kind !== "name") {
    throw new UnsupportedConstructError(`${call.name}() first argument must be a signal name`)
  }
  const values: string[] = [signal.name]
  for (let i = 0; i < roles.length; i++) {
    const lit = call.args[i + 1]
    if (lit.kind !== "string" || !lit.value.trim()) {
      throw new UnsupportedConstructError(
        `${call.name}()'s ${roles[i]} is fixed by the pack and must be a non-empty string literal`,
      )
    }
    values.push(lit.value)
  }
  return values
}

export function undeterminedAtoms(node: Expr): readonly [string, string, string][] {
  return atomCalls(node, UNDETERMINED_CALL).map((c) => {
    const [s, p, a] = literalArgs(c, ["the open-textured predicate", "the authority that settles it"])
    return [s, p, a]
  })
}
export function hasUndeterminedAtom(node: Expr): boolean {
  return hasAtom(node, UNDETERMINED_CALL)
}
export function hasDegreeAtom(node: Expr): boolean {
  return hasAtom(node, DEGREE_CALL)
}

/** The (outcome, protected) pair when the *whole* property is one counterfactual atom. */
export function counterfactualAtom(node: Expr): [string, string] | null {
  if (node.kind === "call" && node.name === COUNTERFACTUAL_CALL && node.args.length === 2) {
    const [o, p] = node.args
    if (o.kind !== "name" || p.kind !== "name") {
      throw new UnsupportedConstructError(`${COUNTERFACTUAL_CALL}() arguments must be signal names`)
    }
    if (o.name === p.name) {
      throw new UnsupportedConstructError(
        `${COUNTERFACTUAL_CALL}(${o.name}, ${o.name}) asks whether ${o.name} moves when it is ` +
          `itself moved, which the shape of the question answers and no system does`,
      )
    }
    return [o.name, p.name]
  }
  return null
}

/** Every signal name a property reads, sorted, excluding the names of its function calls. */
export function signalNames(node: Expr): readonly string[] {
  const called = new Set(
    walk(node).filter((e) => e.kind === "call").map((e) => (e.kind === "call" ? e.name : "")),
  )
  const names = new Set(
    walk(node)
      .filter((e): e is Extract<Expr, { kind: "name" }> => e.kind === "name")
      .map((e) => e.name)
      .filter((name) => !called.has(name)),
  )
  return [...names].sort()
}

/** Whether a node is settled by present() atoms and boolean connectives over them alone. */
function isPresenceOnly(node: Expr): boolean {
  switch (node.kind) {
    case "call":
      return presenceAtoms(node) !== null && node.name === PRESENCE_CALL
    case "and":
    case "or":
      return node.values.every(isPresenceOnly)
    case "not":
      return isPresenceOnly(node.operand)
    default:
      return presenceAtoms(node) !== null
  }
}

/**
 * The signal names a property cannot be evaluated without. `requires` is a conjunctive gate, so a
 * name a disjunction turns into an *alternative* is exempt: gating one branch would report a system
 * that lawfully took the other unattainable without running it. A name in every disjunct stays gated.
 */
export function unconditionalSignalNames(node: Expr): readonly string[] {
  if (node.kind === "or") {
    if (!node.values.every(isPresenceOnly)) {
      return signalNames(node)
    }
    // The intersection over the branches: a name every disjunct reads stays gated, a name only one
    // of them reads is an alternative and is exempt.
    const branches: string[][] = node.values.map((v) => [...signalNames(v)])
    if (branches.length === 0) return []
    const common: string[] = branches
      .slice(1)
      .reduce(
        (acc, branch) => acc.filter((name) => branch.includes(name)),
        branches[0] as string[],
      )
    return [...new Set(common)].sort()
  }
  if (node.kind === "and") {
    return [...new Set(node.values.flatMap((v) => unconditionalSignalNames(v)))].sort()
  }
  if (node.kind === "call") {
    return [...new Set(node.args.flatMap((a) => unconditionalSignalNames(a)))].sort()
  }
  return signalNames(node)
}

/** The signal names of a conjunction-of-present() property, else null. */
export function presenceAtoms(node: Expr): readonly string[] | null {
  if (node.kind === "call" && node.name === PRESENCE_CALL && node.args.length === 1) {
    const a = node.args[0]
    return a.kind === "name" ? [a.name] : null
  }
  if (node.kind === "and") {
    const names: string[] = []
    for (const v of node.values) {
      const part = presenceAtoms(v)
      if (part === null) return null
      names.push(...part)
    }
    return names
  }
  return null
}

// ---------------------------------------------------------------------------
// Kind checking and fragment classification
// ---------------------------------------------------------------------------

/** Validate a parsed expression is a legal Boolean property; throws UnsupportedConstructError. */
export function validateProperty(node: Expr): void {
  if (hasAtom(node, COUNTERFACTUAL_CALL) && counterfactualAtom(node) === null) {
    throw new UnsupportedConstructError(
      `${COUNTERFACTUAL_CALL}() is a property of a *pair* of executions and is the whole of a ` +
        `spec or no part of one; a spec combining it with anything else is refused`,
    )
  }
  // `contains()` is the one atom that reads *what a statement says* rather than whether a field is
  // blank, and it must keep agreeing across every encoding of the language. That is why the case
  // fold is ASCII-only and one-to-one, and why a non-ASCII phrase is refused rather than folded by
  // a rule the other encodings do not share. An empty phrase is refused because every statement
  // contains it, so the atom would decide nothing.
  for (const call of atomCalls(node, CONTAINS_CALL)) {
    if (call.kind !== "call") continue
    if (call.args.length !== 2) {
      throw new UnsupportedConstructError(
        `${CONTAINS_CALL}() takes a signal name and a phrase; unexpected arity`,
      )
    }
    const [haystack, phrase] = call.args
    if (haystack.kind !== "name") {
      throw new UnsupportedConstructError(
        `${CONTAINS_CALL}()'s first argument must be a signal name, not a computed expression`,
      )
    }
    if (phrase.kind !== "string") {
      throw new UnsupportedConstructError(
        `${CONTAINS_CALL}()'s phrase is fixed by the pack and must be a string literal, not a name`,
      )
    }
    if (!phrase.value.trim()) {
      throw new UnsupportedConstructError(
        `${CONTAINS_CALL}() given the empty phrase decides nothing: every statement contains it`,
      )
    }
    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7F]/.test(phrase.value)) {
      throw new UnsupportedConstructError(
        `${CONTAINS_CALL}()'s phrase ${JSON.stringify(phrase.value)} is not ASCII. The case fold ` +
          "must agree across every encoding of this language, and only the ASCII fold is " +
          "one-to-one, so a non-ASCII phrase is refused rather than folded by a rule the other " +
          "encodings do not share",
      )
    }
  }

  // The two open-texture atoms: their literals are fixed by the pack, so a computed or blank one is
  // refused. `literalArgs` is the shared check, asked here so it runs at parse time.
  for (const call of atomCalls(node, UNDETERMINED_CALL)) literalArgs(call, ["predicate", "authority"])
  for (const call of atomCalls(node, DEGREE_CALL)) literalArgs(call, ["predicate"])

  if (hasUndeterminedAtom(node) && hasDegreeAtom(node)) {
    throw new UnsupportedConstructError(
      `a spec uses both undetermined() and degree(); a duty is one or the other`,
    )
  }
  for (const call of walk(node).filter((e) => e.kind === "call" && TEMPORAL_OPERATORS.includes(e.name))) {
    if (hasDegreeAtom(call)) {
      throw new UnsupportedConstructError(
        `degree() under a temporal operator would need a many-valued reading of the operator, ` +
          `which this language does not implement`,
      )
    }
  }
  // A graded atom under a comparison is a *compliance threshold*, and no statute states one. Under
  // arithmetic it is worse: a degree is a truth value on a residuated lattice, not a magnitude to
  // add. Both are load errors rather than something to compute.
  for (const parent of walk(node)) {
    if (parent.kind !== "compare" && parent.kind !== "binary" && parent.kind !== "unary") continue
    const operands =
      parent.kind === "unary" ? [parent.operand] : [parent.left, parent.right]
    for (const operand of operands) {
      if (hasDegreeAtom(operand)) {
        throw new UnsupportedConstructError(
          "degree() under a comparison or arithmetic is a compliance threshold, and no clause " +
            "states one; this tool does not invent a cut-off, so the shape is refused at load",
        )
      }
    }
  }

  // `True` or `False` standing as a Boolean atom is a constant property: it reports every system
  // alike and says nothing about any of them.
  for (const parent of walk(node)) {
    const operands =
      parent.kind === "and" || parent.kind === "or"
        ? parent.values
        : parent.kind === "not"
          ? [parent.operand]
          : parent.kind === "call" && (VALUE_CALLS[parent.name] !== undefined || TEMPORAL_OPERATORS.includes(parent.name))
            ? parent.args
            : []
    for (const operand of operands) {
      if (operand.kind === "bool") {
        throw new UnsupportedConstructError(
          `${operand.value ? "True" : "False"} standing as a Boolean atom is a constant property: ` +
            "it reports every system alike and says nothing about any of them",
        )
      }
    }
  }
  if (node.kind === "bool") {
    throw new UnsupportedConstructError(
      `a spec that is the bare constant ${node.value ? "True" : "False"} is not a property of any ` +
        "system",
    )
  }

  kindCheck(node)
  const kind = kindCheckKind(node)
  if (kind === "number" || kind === "string" || kind === "none") {
    throw new UnsupportedConstructError(
      `Requirement spec has type ${kind}, expected a Boolean property`,
    )
  }
}

type KindKind = "boolean" | "number" | "string" | "none" | "unknown"

function kindCheckKind(node: Expr): KindKind {
  switch (node.kind) {
    case "bool":
      return "boolean"
    case "number":
      return "number"
    case "string":
      return "string"
    case "none":
      return "none"
    case "name":
      return "unknown"
    case "not":
      return requireKind(kindCheckKind(node.operand), "boolean", node)
    case "unary":
      requireKind(kindCheckKind(node.operand), "number", node)
      return "number"
    case "binary":
      requireKind(kindCheckKind(node.left), "number", node)
      requireKind(kindCheckKind(node.right), "number", node)
      return "number"
    case "compare":
      kindCheckKind(node.left)
      kindCheckKind(node.right)
      return "boolean"
    case "and":
    case "or":
      for (const v of node.values) requireKind(kindCheckKind(v), "boolean", v)
      return "boolean"
    case "call": {
      const { name, args } = node
      if (name === PRESENCE_CALL) {
        if (args.length !== 1 || args[0].kind !== "name")
          throw new UnsupportedConstructError(`${PRESENCE_CALL}() takes one signal name`)
        return "boolean"
      }
      if (name === CONTAINS_CALL) {
        if (args.length !== 2 || args[0].kind !== "name" || args[1].kind !== "string")
          throw new UnsupportedConstructError(
            `${CONTAINS_CALL}() takes a signal name and a non-empty string literal phrase`,
          )
        return "boolean"
      }
      if (name === COUNTERFACTUAL_CALL || name === UNDETERMINED_CALL || name === DEGREE_CALL) {
        argRoles(name)
        return "boolean"
      }
      if (TEMPORAL_OPERATORS.includes(name)) {
        const operands = BINARY_TEMPORAL_OPERATORS.includes(name as never) ? 2 : 1
        if (args.length !== operands)
          throw new UnsupportedConstructError(`${name} takes ${operands} operand(s)`)
        for (const a of args) requireKind(kindCheckKind(a), "boolean", a)
        return "boolean"
      }
      const arity = VALUE_CALLS[name]
      if (arity === undefined) {
        throw new UnsupportedConstructError(`Unsupported function call: ${name}(...)`)
      }
      if (args.length !== arity)
        throw new UnsupportedConstructError(`${name} expects ${arity} argument(s)`)
      const kinds = args.map(kindCheckKind)
      const expected = ["implies", "Implies", "Iff"].includes(name) ? "boolean" : "number"
      args.forEach((a, idx) => requireKind(kinds[idx], expected as never, a))
      return expected as KindKind
    }
  }
}

function requireKind(kind: KindKind, expected: KindKind, node: Expr): KindKind {
  if (kind !== expected && kind !== "unknown") {
    throw new UnsupportedConstructError(
      `expected ${expected} operand but found ${kind} at ${JSON.stringify(printExpr(node))}`,
    )
  }
  return kind
}

function argRoles(name: string): void {
  if (name === COUNTERFACTUAL_CALL) {
    // two signal names; roles validated by counterfactualAtom on the whole-node path
  }
  // names after the first are string literals (enforced in eval/signal collection)
}

function kindCheck(node: Expr): void {
  kindCheckKind(node)
}

/** A compact rendering of an expression for error messages. */
export function printExpr(node: Expr): string {
  switch (node.kind) {
    case "name":
      return node.name
    case "bool":
    case "number":
      return String(node.value)
    case "string":
      return JSON.stringify(node.value)
    case "none":
      return "None"
    case "not":
      return `not ${printExpr(node.operand)}`
    case "unary":
      return `${node.op === "neg" ? "-" : "+"}${printExpr(node.operand)}`
    case "binary":
      return `(${printExpr(node.left)} ${node.op} ${printExpr(node.right)})`
    case "compare":
      return `(${printExpr(node.left)} ${node.op} ${printExpr(node.right)})`
    case "and":
      return node.values.map(printExpr).join(" and ")
    case "or":
      return node.values.map(printExpr).join(" or ")
    case "call":
      return `${node.name}(${node.args.map(printExpr).join(", ")})`
  }
}

/**
 * The antecedent of a property that is one implication, or `null` for every other shape.
 *
 * This is the whole of the unreachable-trigger rule that is a fact about the *formula*, and it lives
 * here for the reason the fragment classifier does: there is one property language, every engine
 * parses the same `spec` through it, and the antecedent is the same subtree whatever domain the
 * engine goes on to quantify over. What an engine does with the answer is
 * `report.notEvaluatedForUnreachableTrigger`, so the sentence a reader gets is written once too.
 *
 * A top-level `always` is stripped first: over a finite trace `always(f)` holds exactly when `f`
 * holds at every position, so an antecedent inside `f` that is true at no position leaves the
 * quantification vacuous in the same sense. `eventually(f)` is deliberately not stripped — its
 * vacuity is a different claim, about a position that never existed rather than a trigger that never
 * fired — and neither is a conjunction of implications, whose antecedents are several.
 */
export function implicationAntecedent(node: Expr): Expr | null {
  if (node.kind !== "call") return null
  if (node.name === "always" && node.args.length === 1) {
    return implicationAntecedent(node.args[0])
  }
  if ((IMPLICATION_CALLS as readonly string[]).includes(node.name) && node.args.length === 2) {
    return node.args[0]
  }
  return null
}

/**
 * The narrowest fragment a spec belongs to. The pack loader demands an exact match against the
 * declared `formalism`, so an STL formula can no longer be labelled `record` and silently downgraded.
 */
export function classifyFragment(node: Expr): Formalism {
  if (hasDegreeAtom(node)) return "graded"
  if (hasUndeterminedAtom(node)) return "undetermined"
  if (counterfactualAtom(node) !== null) return "counterfactual"
  if (node.kind === "call" && TEMPORAL_OPERATORS.includes(node.name)) return "temporal"
  if (walk(node).some((e) => e.kind === "call" && TEMPORAL_OPERATORS.includes(e.name))) return "temporal"
  if (presenceAtoms(node) !== null) return "record"
  return "logical"
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type RecordValue = unknown
export type DecisionRecord = Record<string, RecordValue>

/** Evaluate a state (non-temporal) formula against one decision record, returning a Boolean. */
export function evalExpression(node: Expr, record: DecisionRecord): boolean {
  switch (node.kind) {
    case "bool":
      return node.value
    case "not":
      return !evalExpression(node.operand, record)
    case "and":
      return node.values.every((v) => evalExpression(v, record))
    case "or":
      return node.values.some((v) => evalExpression(v, record))
    case "compare": {
      const l = evalNumber(node.left, record)
      const r = evalNumber(node.right, record)
      switch (node.op) {
        case "==": return l === r
        case "!=": return l !== r
        case "<": return l < r
        case "<=": return l <= r
        case ">": return l > r
        case ">=": return l >= r
      }
      return false
    }
    // Arithmetic never stands where a Boolean is expected: `validateProperty` refuses a property
    // whose value is a magnitude, so these reach here only from a node built by hand. A magnitude
    // silently read as a flag is the coercion this language exists to refuse.
    case "binary":
    case "unary":
      throw new UnsupportedConstructError(
        `${printExpr(node)} is a magnitude, not a proposition; it can stand only inside a comparison`,
      )
    case "name":
      // A bare name in Boolean position reads the record's value as a flag.
      return isFlagTrue(record[node.name])
    case "number":
      return node.value !== 0
    case "call": {
      const { name, args } = node
      if (name === PRESENCE_CALL) {
        const a = args[0]
        return a.kind === "name" ? isPresent(record[a.name]) : false
      }
      if (name === CONTAINS_CALL) {
        const a = args[0]
        const lit = args[1]
        return a.kind === "name" && lit.kind === "string"
          ? containsLiteral(record[a.name], lit.value)
          : false
      }
      if (name === "implies" || name === "Implies") {
        return !evalExpression(args[0], record) || evalExpression(args[1], record)
      }
      if (name === "Iff") {
        return evalExpression(args[0], record) === evalExpression(args[1], record)
      }
      if (name === "abs" || name === "min" || name === "max") {
        throw new UnsupportedConstructError(
          `${name}(...) is a magnitude, not a proposition; it can stand only inside a comparison`,
        )
      }
      // COUNTERFACTUAL_CALL, UNDETERMINED_CALL, DEGREE_CALL and the temporal operators are not
      // properties of one record.
      throw new UnsupportedConstructError(
        `${name}(...) cannot be evaluated against a single decision record`,
      )
    }
    case "string":
    case "none":
      throw new UnsupportedConstructError(`a ${node.kind} literal cannot stand as a Boolean atom`)
  }
}

function evalNumber(node: Expr, record: DecisionRecord): number {
  switch (node.kind) {
    case "number":
      return node.value
    case "name":
      return typeof record[node.name] === "number" ? (record[node.name] as number) : NaN
    case "unary":
      return node.op === "neg" ? -evalNumber(node.operand, record) : evalNumber(node.operand, record)
    case "binary": {
      const l = evalNumber(node.left, record)
      const r = evalNumber(node.right, record)
      switch (node.op) {
        case "+": return l + r
        case "-": return l - r
        case "*": return l * r
        case "/": return r === 0 ? Infinity : l / r
        case "%": return r === 0 ? NaN : l % r
        default: return NaN
      }
    }
    case "call": {
      if (node.name === "abs") return Math.abs(evalNumber(node.args[0], record))
      if (node.name === "min")
        return Math.min(evalNumber(node.args[0], record), evalNumber(node.args[1], record))
      if (node.name === "max")
        return Math.max(evalNumber(node.args[0], record), evalNumber(node.args[1], record))
      throw new UnsupportedConstructError(
        `${node.name}(...) is a proposition, not a magnitude; it cannot stand inside a comparison`,
      )
    }
    default:
      throw new UnsupportedConstructError(
        `expected a numeric expression but found ${JSON.stringify(node.kind)}`,
      )
  }
}

/** A bare signal in Boolean position reads the record's value as a flag. */
export function isFlagTrue(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") return value.trim() !== ""
  return isPresent(value)
}

// ---------------------------------------------------------------------------
// Temporal observer over a trace
// ---------------------------------------------------------------------------

/**
 * Evaluate a formula at position `i` over a whole trace. State atoms answer against one record;
 * the temporal operators quantify over the suffix/prefix from `i`. This is the semantics
 * `engines/observed` reasons over, a finite-array form of what rtamt monitors.
 */
export function evalAt(node: Expr, trace: readonly DecisionRecord[], i: number): boolean {
  switch (node.kind) {
    // The Boolean connectives are compositional over positions, so they recurse here rather than
    // falling through to the per-record interpreter — which would refuse a temporal operator under
    // them and report `always(p) and always(q)` unevaluable.
    case "not":
      return !evalAt(node.operand, trace, i)
    case "and":
      return node.values.every((v) => evalAt(v, trace, i))
    case "or":
      return node.values.some((v) => evalAt(v, trace, i))
    case "call": {
      const { name, args } = node
      if (name === "always") return range(trace, i, trace.length).every((j) => evalAt(args[0], trace, j))
      if (name === "eventually") return range(trace, i, trace.length).some((j) => evalAt(args[0], trace, j))
      if (name === "until")
        return range(trace, i, trace.length).some((j) =>
          evalAt(args[1], trace, j) && range(trace, i, j).every((k) => evalAt(args[0], trace, k)),
        )
      if (name === "since")
        return range(trace, 0, i + 1).some((j) =>
          evalAt(args[1], trace, j) && range(trace, j + 1, i + 1).every((k) => evalAt(args[0], trace, k)),
        )
      // The past operators include the current position, as rtamt's do: `once(p)` at position 0 of
      // a trace whose first record satisfies `p` holds.
      if (name === "once") return range(trace, 0, i + 1).some((j) => evalAt(args[0], trace, j))
      if (name === "historically")
        return range(trace, 0, i + 1).every((j) => evalAt(args[0], trace, j))
      if (name === "next") return i + 1 < trace.length && evalAt(args[0], trace, i + 1)
      if (name === "prev") return i > 0 && evalAt(args[0], trace, i - 1)
      if (name === "rise")
        return i + 1 < trace.length && !evalAt(args[0], trace, i) && evalAt(args[0], trace, i + 1)
      if (name === "fall")
        return i + 1 < trace.length && evalAt(args[0], trace, i) && !evalAt(args[0], trace, i + 1)
      // The connectives spelled as calls recurse for the same reason `and`/`or` above do.
      if (name === "implies" || name === "Implies")
        return !evalAt(args[0], trace, i) || evalAt(args[1], trace, i)
      if (name === "Iff") return evalAt(args[0], trace, i) === evalAt(args[1], trace, i)
      // Every other atom is a property of one decision record, evaluated at this position.
      return evalExpression(node, trace[i])
    }
    default:
      return evalExpression(node, trace[i])
  }
}

function range(trace: readonly unknown[], start: number, end: number): number[] {
  const out: number[] = []
  for (let i = Math.max(0, start); i < end; i++) out.push(i)
  return out
}

/**
 * The observed verdict for a spec over a trace: the formula must hold at every position. For the
 * shipped shape `always(φ)` this is equivalent to φ holding at every position (the monitor's
 * satisfied reading); for a state spec over a multi-decision trace it means every decision record
 * satisfies the per-record property.
 */
export function traceHolds(node: Expr, trace: readonly DecisionRecord[]): boolean {
  if (trace.length === 0) {
    throw new UnsupportedConstructError("no decision records to observe (empty trace)")
  }
  return range(trace, 0, trace.length).every((j) => evalAt(node, trace, j))
}