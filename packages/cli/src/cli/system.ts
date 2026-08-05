/**
 * How a shell run names the system under test, and the one place a system is resolved.
 *
 * Two ways in, and they are different claims about where the system came from:
 *
 *   - `--system <name>` picks one of the systems this package ships. Nothing outside the package is
 *     loaded, and the set is closed.
 *   - `--system-module <specifier>:<export>` **IMPORTS AND EXECUTES** the named module and takes
 *     the export from it — the TypeScript analogue of the `module:attribute` spelling Python's
 *     reasonsmith uses, and of gunicorn's application path. It is the only way a shell run reaches a
 *     system this package did not ship, and so the only way the stronger rungs are reachable without
 *     writing a program.
 *
 * What a reader must not break:
 *   - **`--system-module` must read as a code-loading flag everywhere it is named.** `--help` says
 *     it imports and executes, and so must any document that names it. A flag that loads and runs
 *     the caller's code must never read as an innocuous file argument.
 *   - The two are mutually exclusive and one is required. A run given both would report on a system
 *     the caller did not ask about; a run given neither has nothing to report on. Both are usage
 *     errors, which is exit code 1.
 *   - An export may be a system or a zero-argument factory returning one. It is checked against the
 *     three methods the protocol requires (`capabilities`, `decisions`, `logic`) and the refusal
 *     names *which* one is missing, because "not a SystemUnderTest" tells an adapter author nothing.
 */

import type { SystemUnderTest } from "@reasonsmith/core"

/** The methods the protocol requires, in the order a refusal names them. */
const SUT_METHODS = ["capabilities", "decisions", "logic"] as const

/** A usage or input error: the CLI exits 1 on one of these, never 2. */
export class UsageError extends Error {
  readonly usage = true
}

/**
 * The systems this package ships, by the name `--system` takes.
 *
 * Three systems, one duty, three surfaces — which is the whole point of the set: the rung a duty
 * reaches is a fact about what a system exposes, not about which word a pack author typed. The
 * factories are lazy so `--help` and `list-packs` never construct one.
 */
export const SHIPPED_SYSTEMS: Record<string, { describe: string; load: () => Promise<SystemUnderTest> }> = {
  "truncating-credit": {
    describe:
      "the adverse-action pipeline whose notice states one reason while its own inference used " +
      "five — exposes artifact(), so the reason-adequacy duty reaches the certificate rung and " +
      "comes back VIOLATED while the form duty on the same clause passes",
    load: async () => (await import("@reasonsmith/systems")).deployedCreditSystem(),
  },
  "neural-scorer": {
    describe:
      "a risk network served behind an inference API, audited from its exported decision log " +
      "alone — no decide(), no logic(), so observed is its ceiling",
    load: async () => (await import("@reasonsmith/systems")).neuralScorer(),
  },
  "probabilistic-scorer": {
    describe:
      "a calibrated log-odds scorer that can be re-run in process — exposes decide(), so the " +
      "replay search reaches the probed rung",
    load: async () => (await import("@reasonsmith/systems")).probabilisticScorer(),
  },
}

export const SHIPPED_SYSTEM_NAMES = Object.keys(SHIPPED_SYSTEMS).sort()

function assertIsSystem(candidate: unknown, source: string): SystemUnderTest {
  if (candidate === null || typeof candidate !== "object") {
    throw new UsageError(
      `${source} is ${candidate === null ? "null" : typeof candidate}, not a system under test. ` +
        `It must expose ${SUT_METHODS.join("(), ")}().`,
    )
  }
  for (const method of SUT_METHODS) {
    if (typeof (candidate as Record<string, unknown>)[method] !== "function") {
      throw new UsageError(
        `${source} is not a system under test: it exposes no ${method}(). The protocol requires ` +
          `${SUT_METHODS.join("(), ")}(); decide() and artifact() are optional and are what the ` +
          "stronger rungs read.",
      )
    }
  }
  return candidate as SystemUnderTest
}

/**
 * Load the system a `--system-module <specifier>:<export>` names.
 *
 * IMPORTS AND EXECUTES the specifier. A bare specifier with no `:` is refused rather than guessed
 * at: guessing a default export name would make a typo resolve to the wrong system silently.
 */
export async function loadSystemModule(reference: string): Promise<SystemUnderTest> {
  const separator = reference.lastIndexOf(":")
  if (separator <= 0 || separator === reference.length - 1) {
    throw new UsageError(
      `--system-module must be spelled <specifier>:<export>, e.g. ` +
        `"@reasonsmith/systems:deployedCreditSystem" or "./my-system.ts:systemUnderTest"; got ` +
        `${JSON.stringify(reference)}.`,
    )
  }
  const specifier = reference.slice(0, separator)
  const exportName = reference.slice(separator + 1)

  let module: Record<string, unknown>
  try {
    // A bare relative path is resolved against the working directory rather than against this file,
    // because the caller typed it in their own shell and that is what they meant.
    const resolved = specifier.startsWith(".")
      ? new URL(specifier, `file://${process.cwd()}/`).href
      : specifier
    module = (await import(resolved)) as Record<string, unknown>
  } catch (error) {
    throw new UsageError(
      `--system-module could not import ${JSON.stringify(specifier)}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!(exportName in module)) {
    const available = Object.keys(module).sort().join(", ") || "nothing"
    throw new UsageError(
      `--system-module: ${JSON.stringify(specifier)} exports no ${JSON.stringify(exportName)}. ` +
        `It exports: ${available}.`,
    )
  }

  const value = module[exportName]
  // A zero-argument factory or the system itself, exactly as the Python flag accepts both.
  if (typeof value === "function") {
    const produced = (value as () => unknown)()
    const awaited = produced instanceof Promise ? await produced : produced
    return assertIsSystem(awaited, `${specifier}:${exportName}()`)
  }
  return assertIsSystem(value, `${specifier}:${exportName}`)
}

/**
 * The system a run judges, from whichever of the two flags was given.
 *
 * `--system` takes a shipped system's name *or* a path to a JSONL decision log, and the shipped
 * names win: the set is closed and small, so a name in it is never also a path someone meant. A
 * value that is neither is refused naming both readings, because "not found" over an ambiguous flag
 * tells the caller nothing about which of the two they got wrong.
 */
export async function resolveSystem(options: {
  system?: string
  systemModule?: string
  capabilities?: string
  systemName?: string
  systemDomains?: readonly string[] | null
}): Promise<{ sut: SystemUnderTest; describedAs: string }> {
  const { system, systemModule, capabilities } = options
  if (system && systemModule) {
    throw new UsageError(
      "--system and --system-module name two different systems and are mutually exclusive. " +
        "Neither is merged into the other and neither is silently dropped.",
    )
  }
  if (systemModule) {
    if (capabilities) {
      throw new UsageError(
        "--system-module refuses --capabilities: a capability declaration file speaks for a " +
          "decision log's adapter, while an imported system declares its own capabilities. " +
          "Merging them would report a capability set the system never claimed.",
      )
    }
    return { sut: await loadSystemModule(systemModule), describedAs: systemModule }
  }
  if (system) {
    const shipped = SHIPPED_SYSTEMS[system]
    if (shipped) {
      if (capabilities) {
        throw new UsageError(
          `--capabilities speaks for a decision log's adapter, and --system ${system} is a system ` +
            "this package ships, which declares its own capabilities.",
        )
      }
      return { sut: await shipped.load(), describedAs: system }
    }
    // Not a shipped name, so it is a path to a decision log.
    const { JSONLSystem, readCapabilitiesFile, readJSONL } = await import("./jsonl.ts")
    const records = readJSONL(system)
    const declared = capabilities ? readCapabilitiesFile(capabilities) : null
    return {
      sut: new JSONLSystem(
        options.systemName ?? system,
        records,
        declared,
        options.systemDomains ?? [],
      ),
      describedAs: system,
    }
  }
  throw new UsageError(
    "no system given: pass --system <name> for one this package ships " +
      `(${SHIPPED_SYSTEM_NAMES.join(", ")}), --system <path.jsonl> for a decision log, or ` +
      "--system-module <specifier>:<export>, which IMPORTS AND EXECUTES the named module and " +
      "takes the export from it.",
  )
}
