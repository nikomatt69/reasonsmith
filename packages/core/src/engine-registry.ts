/**
 * The engines a build has, and the shapes the ladder calls them through.
 *
 * Python resolves each rung by a late `import` inside `report._engine_ladder`, which keeps the
 * report module from importing engines at module load. Here the dependency runs the other way —
 * `@reasonsmith/engines` depends on `@reasonsmith/core` — so the ladder cannot import an engine at
 * all. It asks this table instead, and `@reasonsmith/engines` fills it in when it is imported.
 *
 * The table is the *only* thing that changed in the port. What must not change:
 *
 *   - A rung absent from the table is a rung the ladder does not append, exactly as
 *     `SUPPORTED_FORMALISMS` is widened when the engine lands and not before. The ladder never
 *     substitutes a weaker engine for a missing stronger one and never reports at a rung no engine
 *     stood on.
 *   - `certificate` is the *single* rung of the deleted-reason duty. A build with no certificate
 *     engine reports that duty not evaluated; it never falls through to a presence check on the
 *     reason field, which is the substitution the duty exists to refuse.
 *   - Nothing here may report above the rung the ladder appended it at.
 */

import type { DecisionRecord } from "./language.ts"
import type { RequirementResult } from "./report.ts"
import type { Requirement } from "./spec.ts"
import type { DeclaredLogic, SystemUnderTest } from "./sut.ts"

/** An engine reading the decision trace: the record and observed rungs, and the certificate rung. */
export type TraceEngine = (
  req: Requirement,
  sut: SystemUnderTest,
  records: readonly DecisionRecord[],
) => RequirementResult

/**
 * An engine that *runs* the system: the replay search. `records` is the trace when the caller
 * already holds one, and `traceProvider` reads it lazily otherwise — so a replay rung that never
 * needed the trace never causes it to be read.
 */
export type ReplayEngine = (
  req: Requirement,
  sut: SystemUnderTest,
  records: readonly DecisionRecord[] | null,
  traceProvider: (() => readonly DecisionRecord[]) | null,
) => RequirementResult

/** An engine reasoning over declared logic: the proof rungs. */
export type LogicEngine = (
  req: Requirement,
  sut: SystemUnderTest,
  records: readonly DecisionRecord[] | null,
  logic: DeclaredLogic | null,
) => RequirementResult

export interface EngineTable {
  /** A presence conjunction over the trace, named conjunct by conjunct. */
  record?: TraceEngine
  /** Every other state or temporal formula, monitored per record. */
  observed?: TraceEngine
  /** The replay search over `decide()`. */
  probed?: ReplayEngine
  /** The reason-deletion measurement over `artifact()`. The deleted-reason duty's only rung. */
  certificate?: TraceEngine
  /** A state property discharged against declared logic. Absent in a build with no solver. */
  proved?: LogicEngine
  /** `always(f)` reduced to the state property `f` and handed to the proof rung. */
  temporalProof?: LogicEngine
  /** Whether a spec is `always(f)` with `f` free of temporal operators. Owned by the temporal engine. */
  statePropertyUnderAlways?: (spec: string) => boolean
  /** Self-composition at the proof rung, for the relational fragment. */
  counterfactualProof?: LogicEngine
  /** Paired replay at the probed rung, for the relational fragment. */
  pairedReplay?: ReplayEngine
}

const table: EngineTable = {}

/** Install engines. Called once by `@reasonsmith/engines`; later calls merge. */
export function registerEngines(engines: EngineTable): void {
  Object.assign(table, engines)
}

/** The engines this build has. */
export function engines(): Readonly<EngineTable> {
  return table
}
