/**
 * `@reasonsmith/systems` — the demonstration systems, and the answer to "how does any model get
 * into this tool?"
 *
 * Three systems, checked against the *same* binding duty, reaching different rungs — because which
 * rung a duty reaches is a fact about what the system exposes and not about which word a pack author
 * typed:
 *
 *   - `neuralScorer` — a log and nothing else. `observed` is its ceiling, and raising it means
 *     changing the *system*, never the adapter.
 *   - `probabilisticScorer` — replayable through `decide()`, so it reaches `probed`.
 *   - `deployedCreditSystem` — exposes `artifact()`, so the reason-adequacy duty reaches the
 *     certificate rung and comes back **violated** while the *form* duty on the same clause passes.
 *
 * That last one is the point of the set: before it, a reader who ran every shipped example never saw
 * the tool report a breach. `truncating-credit-system.test.ts` pins it.
 *
 * **Python's third system is not this one, and the difference is a limit of this build.** There the
 * trio ends with a symbolic rule set reaching `proved`, over every input its declared constraints
 * admit. That rung needs an SMT solver and there is none here, so porting that system would have
 * demonstrated a ceiling of `probed` under a name promising more. The rung ladder shipped here is
 * `observed` / `probed`, and `@reasonsmith/engines`' `MISSING_RUNGS` says which rungs are absent and
 * why. Nothing weaker stands in for them.
 */

export * from "./ground-program.ts"
export * from "./truncating-credit-system.ts"
export * from "./neural-scorer.ts"
export * from "./probabilistic-scorer.ts"

/**
 * One row of the systems picker: the `--system` id, the class name the adapter reports, and a
 * one-line gloss a reader can scan without running the system. Kept in this barrel so a future
 * fourth system adds one entry here and one export above.
 */
export interface SystemEntry {
  readonly id: string
  readonly name: string
  readonly description: string
}

/**
 * The systems this package ships, in the order `--system` accepts. The `id` is the CLI string; the
 * `name` is what `SystemUnderTest.name` reports, so the picker agrees with the report header.
 */
export const SYSTEMS: readonly SystemEntry[] = [
  {
    id: "truncating-credit",
    name: "TruncatingCreditSystem",
    description:
      "A deployed credit pipeline whose reason-giving duty comes back satisfied while the same " +
      "clause's content duty comes back violated — the demonstration's own case.",
  },
  {
    id: "neural-scorer",
    name: "JSONLAdapter",
    description:
      "A neural scorer audited from its decision log alone; nothing crosses the boundary, so the " +
      "strongest evidence available here is `observed`.",
  },
  {
    id: "probabilistic-scorer",
    name: "CallableAdapter",
    description:
      "A replayable probabilistic scorer; the probe perturbs logged decisions and replays them " +
      "through `decide()`, which is the `probed` rung.",
  },
]

/** The picker entry list, in declaration order. */
export function listSystems(): readonly SystemEntry[] {
  return SYSTEMS
}
