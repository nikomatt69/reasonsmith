/**
 * The TUI entry point: parse the arguments, run the check once, then browse the result.
 *
 * The import order is load-bearing and is the same order the CLI uses:
 *
 *   1. `@reasonsmith/core` registers the built-in packs at import time.
 *   2. `@reasonsmith/engines` registers this build's four engines into the table the ladder reads.
 *      **Without this import the ladder is empty and every duty comes back not evaluated** — which
 *      is the honest answer for a build with no engines, and a silent disaster for one that has
 *      them and forgot to load them.
 *   3. `@reasonsmith/systems` is where the demonstration systems live.
 *
 * What a reader must not break:
 *
 *   - **The run happens once, before the renderer mounts.** The TUI reads a result; it does not
 *     watch one form. A live run would mean the report a reader is looking at could change under
 *     them, and it would put `sut.decisions()` behind a keystroke — while the whole guarantee of
 *     the unattainable analysis is that a duty answered from declared capabilities never executes
 *     the system at all.
 *   - **The exit code is the CLI's contract, kept here too: `2` when any result is violated.** Not
 *     when a duty is unattainable, not when one is not evaluated — those are findings to read, not
 *     verdicts against the system.
 */

import "@reasonsmith/core"
import "@reasonsmith/engines"
import { type ConformanceReport, type Pack, checkConformance, listPacks, loadPack } from "@reasonsmith/core"
import type { SystemUnderTest } from "@reasonsmith/core"
import {
  deployedCreditSystem,
  neuralScorer,
  probabilisticScorer,
} from "@reasonsmith/systems"
import { tui } from "./app.tsx"

/** The systems this build ships, by the name `--system` takes. */
const SYSTEMS: Record<string, () => SystemUnderTest> = {
  "truncating-credit": deployedCreditSystem,
  "neural-scorer": neuralScorer,
  "probabilistic-scorer": probabilisticScorer,
}

interface Args {
  pack: string
  system: string
}

function parseArgs(argv: readonly string[]): Args | { error: string } {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === "--pack" || token === "--system") {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith("--")) {
        return { error: `${token} needs a value` }
      }
      args[token.slice(2)] = value
      i += 1
      continue
    }
    if (token === "-h" || token === "--help") return { error: "help" }
    return { error: `unknown argument ${token}` }
  }
  return { pack: args.pack ?? "ecoa", system: args.system ?? "truncating-credit" }
}

const USAGE = [
  "usage: reasonsmith-tui [--pack <name>] [--system <name>]",
  "",
  `  --pack     ${listPacks().join(", ")}   (default: ecoa)`,
  `  --system   ${Object.keys(SYSTEMS).join(", ")}   (default: truncating-credit)`,
  "",
  "keys: j/k move · enter open · esc back · a audience · L limits · t theme · ctrl+x leader · q quit",
].join("\n")

/** CLI contract — `reasonsmith tui` reaches the TUI through this function only. */
export async function runTUI(): Promise<number> {
  return main()
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv)
  if ("error" in parsed) {
    const help = parsed.error === "help"
    process.stderr.write(help ? `${USAGE}\n` : `reasonsmith-tui: ${parsed.error}\n\n${USAGE}\n`)
    return help ? 0 : 1
  }

  const build = SYSTEMS[parsed.system]
  if (build === undefined) {
    process.stderr.write(
      `reasonsmith-tui: unknown system ${parsed.system}; known: ${Object.keys(SYSTEMS).join(", ")}\n`,
    )
    return 1
  }

  let pack: Pack
  try {
    pack = loadPack(parsed.pack)
  } catch (error) {
    process.stderr.write(
      `reasonsmith-tui: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    return 1
  }

  const system = build()
  const report: ConformanceReport = checkConformance(system, pack, {
    systemName: system.name,
  })

  await tui(report)

  // Only a violation is a verdict against the system. Unattainable, not applicable and not
  // evaluated are findings to read in the report.
  return report.results.some((r) => r.verdict === "violated") ? 2 : 0
}

if (import.meta.main) {
  process.exitCode = await main()
}
