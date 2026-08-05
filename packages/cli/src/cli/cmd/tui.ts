/**
 * `reasonsmith tui` — open the report browser.
 *
 * nikcli's split: the TUI is its own package with its own renderer, and the CLI reaches it through
 * one function. The import is dynamic and its specifier is held in a constant so this module does
 * not pull the OpenTUI runtime into CLI startup — a terminal renderer that installs itself during
 * `--help` is a renderer that has already cost every other command its startup time.
 *
 * What a reader must not break:
 *   - The contract with `@reasonsmith/tui` is one function, `runTUI(): Promise<number>`, returning
 *     the exit code. The CLI does not reach into the TUI's internals, and the TUI does not decide
 *     the CLI's exit code contract for any other verb.
 *   - A build without the TUI package installed says so in one sentence and exits 1. It does not
 *     stack-trace: a missing optional surface is a usage problem, not a crash.
 */

import { cmd } from "./cmd.ts"

/** Held in a constant so the bundler and the type checker treat this as a runtime edge. */
const TUI_PACKAGE = "@reasonsmith/tui"

export const TuiCommand = cmd({
  command: "tui",
  describe: "open the conformance report browser",
  builder: (yargs) => yargs,
  handler: async () => {
    let module: { runTUI?: () => Promise<number> }
    try {
      module = (await import(TUI_PACKAGE)) as { runTUI?: () => Promise<number> }
    } catch (error) {
      process.stderr.write(
        `reasonsmith: the TUI is not available in this build (${TUI_PACKAGE} did not load: ` +
          `${error instanceof Error ? error.message : String(error)}).\n`,
      )
      process.exitCode = 1
      return
    }
    if (typeof module.runTUI !== "function") {
      process.stderr.write(
        `reasonsmith: ${TUI_PACKAGE} exports no runTUI(), which is the whole of the contract ` +
          "between the CLI and the TUI.\n",
      )
      process.exitCode = 1
      return
    }
    process.exitCode = await module.runTUI()
  },
})
