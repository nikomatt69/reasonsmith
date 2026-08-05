/**
 * The refusals the property language names, one witness per row.
 *
 * `docs/language.md` §1.7 is a table of refusals keyed by id, and the Python pins it in both
 * directions: every documented refusal has a witness, and every refusal the grammar test knows is
 * named in the table. This is the first half of that pin for the TypeScript build.
 *
 * The point of a table like this is that it is checkable against the *definition* rather than
 * against the implementation. Fourteen of these rows did not hold when this file was first written:
 * `parseProperty` parsed without validating, so the side conditions were reachable only through the
 * pack loader and any other caller got an AST the language refuses.
 */

import { describe, expect, test } from "bun:test"

import { parseProperty } from "./index.ts"

const cases: [string,string][] = [
  ["R-PROSE", "the creditor shall notify the applicant"],
  ["R-UNTERMINATED-STRING", 'contains(a, "oops)'],
  ["R-UNBALANCED-PARENS", "present(a"],
  ["R-EMPTY-ARROW-OPERAND", "present(a) ->"],
  ["R-CHAINED-EQUIVALENCE", "present(a) <=> present(b) <=> present(c)"],
  ["R-UNARY-OP", "~present(a)"],
  ["R-BINARY-OP", "(a & b) > 1"],
  ["R-CONSTRUCT", "a.b > 1"],
  ["R-KEYWORD-ARGUMENT", "present(signal=a)"],
  ["R-UNKNOWN-CALL", "frobnicate(a)"],
  ["R-ARITY", "present(a, b)"],
  ["R-KIND", "present(a) + 1 > 2"],
  ["R-NOT-BOOLEAN", "a + 1"],
  ["R-PRESENT-ARGUMENT", 'present("a")'],
  ["R-CONTAINS-SHAPE", "contains(a, b)"],
  ["R-CONTAINS-EMPTY", 'contains(a, "")'],
  ["R-CONTAINS-NON-ASCII", 'contains(a, "café")'],
  ["R-COUNTERFACTUAL-ARGUMENT", "counterfactually_invariant(a, a)"],
  ["R-COUNTERFACTUAL-COMPOSED", "counterfactually_invariant(a, b) and present(c)"],
  ["R-OPEN-TEXTURE-LITERAL", 'undetermined(a, "", "who")'],
  ["R-OPEN-TEXTURE-BOTH", 'undetermined(a, "p", "who") and degree(b, "q")'],
  ["R-DEGREE-UNDER-COMPARISON", 'degree(a, "p") > 0.5'],
  ["R-DEGREE-UNDER-TEMPORAL", 'always(degree(a, "p"))'],
  ["R-BARE-BOOLEAN-CONSTANT", "True"],
]

describe("every documented refusal is refused", () => {
  test.each(cases)("%s refuses %s", (_id, spec) => {
    // Refused, and named: a refusal with an empty message tells an author nothing.
    expect(() => parseProperty(spec)).toThrow()
    let message = ""
    try {
      parseProperty(spec)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message.length).toBeGreaterThan(10)
  })
})

describe("the language still accepts what it must", () => {
  test.each([
    "present(a)",
    "present(a) and present(b)",
    'present(a) -> contains(a, "internal standards")',
    "always(present(a) -> (b <= 30))",
    "until(present(a), present(b) or present(c))",
    "counterfactually_invariant(outcome, protected)",
    'undetermined(a, "meaningful", "a court")',
    'degree(a, "sufficiently detailed")',
    "present(a) <=> present(b)",
  ])("accepts %s", (spec) => {
    expect(() => parseProperty(spec)).not.toThrow()
  })
})
