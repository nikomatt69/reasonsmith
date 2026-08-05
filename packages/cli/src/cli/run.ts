/**
 * One conformance run, shared by `check` and `serve`.
 *
 * It exists so the two verbs cannot drift into running different things: the report a caller reads
 * on stdout and the report the TUI attaches to over HTTP come from this function and from nowhere
 * else.
 *
 * What a reader must not break:
 *   - **`@reasonsmith/engines` is imported here for its side effect**, and that import is the whole
 *     of what puts rungs on the ladder. Without it the engine table is empty, the ladder appends
 *     nothing, and every duty reports *not evaluated* — a run that looks tidy and establishes
 *     nothing. It is imported at the top of this module rather than inside a function so there is
 *     one place to look for it.
 *   - `--requirement` narrows *which duties are run*, never what a verdict means. The pack it builds
 *     is the shipped requirements unmodified, and the pack id says which subset was run so no reader
 *     mistakes a one-duty run for the whole pack.
 */

// Side-effecting: registers the record, observed, probed and certificate engines into the core's
// engine table. Removing this import silently empties the ladder.
import "@reasonsmith/engines"

import {
  type ConformanceReport,
  Pack,
  checkConformance,
  listPacks,
  loadPack,
} from "@reasonsmith/core"

import { UsageError } from "./system.ts"
import type { SystemUnderTest } from "@reasonsmith/core"

export interface RunOptions {
  pack: string
  sut: SystemUnderTest
  systemName?: string
  systemScope?: string | null
  systemDomains?: readonly string[] | null
  requirements?: readonly string[]
}

/**
 * Load a pack by name, turning the loader's refusal into a usage error.
 *
 * The loader's own message already names the built-in packs, so nothing is appended to it: a
 * refusal that listed them twice reads as two different lists to anyone skimming.
 */
export function packOrUsageError(name: string): Pack {
  try {
    return loadPack(name)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new UsageError(
      message.includes("packs:") ? message : `${message} (built-in packs: ${listPacks().join(", ")})`,
    )
  }
}

/**
 * The pack a run actually checks: the whole thing, or the named subset.
 *
 * The id carries the subset so a report line never reads as the whole pack — `ecoa:<id>` for one
 * duty, `ecoa (3 of 6 requirements)` for several. The requirements themselves are the shipped ones,
 * passed through untouched.
 */
export function narrowPack(pack: Pack, requirements: readonly string[]): Pack {
  if (requirements.length === 0) return pack
  const chosen = requirements.map((id) => {
    try {
      return pack.getRequirement(id)
    } catch {
      throw new UsageError(
        `--requirement ${JSON.stringify(id)} is not in pack ${JSON.stringify(pack.id)}. Run ` +
          `\`reasonsmith validate-pack ${pack.id}\` to list what it contains.`,
      )
    }
  })
  return new Pack({
    id:
      chosen.length === 1
        ? `${pack.id}:${chosen[0].id}`
        : `${pack.id} (${chosen.length} of ${pack.requirements.length} requirements)`,
    title: pack.title,
    description: pack.description,
    source_metadata: pack.source_metadata,
    algebra: pack.algebra,
    requirements: chosen,
  })
}

/** Run one system against one pack. Synchronous, because the domain is. */
export function runCheck(options: RunOptions): ConformanceReport {
  const pack = narrowPack(packOrUsageError(options.pack), options.requirements ?? [])
  return checkConformance(options.sut, pack, {
    systemName: options.systemName ?? "SUT",
    systemScope: options.systemScope ?? null,
    systemDomains: options.systemDomains ?? null,
  })
}

/**
 * The exit code a report earns, and the whole of the contract.
 *
 * **Only a violation is a breach, so only a violation is non-zero.** Unattainable, not applicable
 * and not evaluated are findings to read in the report, not verdicts against the system: an
 * unattainable requirement says the system as built cannot discharge the duty on the evidence
 * supplied, a not-applicable one says the duty is limited to a class or domain this system was not
 * declared to be in, and a not-evaluated one says no engine here checked it. None of the three is
 * evidence the system failed a duty, so none of them fails the caller's build.
 */
export function exitCodeFor(report: ConformanceReport): 0 | 2 {
  return report.results.some((result) => result.verdict === "violated") ? 2 : 0
}
