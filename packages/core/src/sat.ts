/**
 * A small DPLL, holding the unexplored region of one subset lattice.
 *
 * This exists for exactly one caller — `explanations.marco`, which in Python asks Z3 the same
 * question — and it is deliberately not a general-purpose solver: no clause learning, no restarts,
 * no incremental interface. What it must be is *complete*, because `DeletionSearch.exhaustive` is
 * the bound on every reason the certificate calls `deleted`, and a solver that gave up early while
 * reporting unsatisfiable would turn "the lattice is covered" into "we stopped looking" without
 * saying so. Unit propagation plus branching over the remaining variables terminates on every
 * finite clause set, so `null` here means unsatisfiable and never means exhausted.
 *
 * Literals are 1-based and signed, DIMACS style: `3` is variable 2 true, `-3` is variable 2 false.
 */

export type Literal = number
export type Clause = readonly Literal[]

const varOf = (literal: Literal): number => Math.abs(literal) - 1
const signOf = (literal: Literal): boolean => literal > 0

/**
 * A total assignment satisfying every clause, or null when there is none.
 *
 * The empty clause set is satisfied by all-false, which is the empty seed the MARCO loop starts
 * from — the first question it asks is whether deleting nothing moves the engine.
 */
export function satModel(variables: number, clauses: readonly Clause[]): boolean[] | null {
  const assignment: (boolean | undefined)[] = new Array(variables).fill(undefined)
  if (!solve(assignment, clauses, 0)) return null
  return assignment.map((value) => value === true)
}

function solve(
  assignment: (boolean | undefined)[],
  clauses: readonly Clause[],
  from: number,
): boolean {
  const propagated = propagate(assignment, clauses)
  if (propagated === null) return false

  let branch = -1
  for (let i = from; i < propagated.length; i++) {
    if (propagated[i] === undefined) {
      branch = i
      break
    }
  }
  if (branch === -1) {
    for (let i = 0; i < propagated.length; i++) {
      assignment[i] = propagated[i] ?? false
    }
    // Every variable is assigned (unassigned ones defaulted false); confirm nothing is violated.
    return clauses.every((clause) =>
      clause.some((literal) => assignment[varOf(literal)] === signOf(literal)),
    )
  }

  for (const value of [false, true]) {
    const trial = [...propagated]
    trial[branch] = value
    if (solve(trial, clauses, branch + 1)) {
      for (let i = 0; i < trial.length; i++) assignment[i] = trial[i]
      return true
    }
  }
  return false
}

/** Unit propagation to a fixed point, or null when a clause is falsified. */
function propagate(
  assignment: readonly (boolean | undefined)[],
  clauses: readonly Clause[],
): (boolean | undefined)[] | null {
  const current = [...assignment]
  for (;;) {
    let changed = false
    for (const clause of clauses) {
      let unassigned: Literal | null = null
      let count = 0
      let satisfied = false
      for (const literal of clause) {
        const value = current[varOf(literal)]
        if (value === undefined) {
          unassigned = literal
          count += 1
        } else if (value === signOf(literal)) {
          satisfied = true
          break
        }
      }
      if (satisfied) continue
      if (count === 0) return null
      if (count === 1 && unassigned !== null) {
        current[varOf(unassigned)] = signOf(unassigned)
        changed = true
      }
    }
    if (!changed) return current
  }
}
