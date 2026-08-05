/**
 * The `reasonsmith` front door.
 *
 * Wired like nikcli's: yargs over `hideBin(process.argv)`, one module per command under
 * `src/cli/cmd/`, `.strict()` so an unknown flag is a usage error rather than a silently ignored
 * one, and a `.fail()` handler that keeps every usage failure on exit code 1.
 *
 * What a reader must not break:
 *   - **The exit code contract, which lives in `cli/run.ts` and is stated in `check --help`:
 *     2 when at least one requirement is VIOLATED, 1 on a usage or input error, 0 otherwise.**
 *     Automation relies on 2 to distinguish a breach from a clean run and from a syntax error. This
 *     file's job is to make sure nothing on the error path can turn a breach into a 1 or a syntax
 *     error into a 2.
 *   - Only a violation is a breach, so only a violation is non-zero. Unattainable, not applicable
 *     and not evaluated are findings to read in the report, not verdicts against the system, and
 *     none of them fails the caller's build.
 *   - `process.exitCode` rather than `process.exit()` on the ordinary paths, so buffered stdout is
 *     flushed before the process leaves. A `serve` run never reaches the end of `parse()` at all —
 *     it is handed to the Effect runtime and stays there.
 *   - Nothing here imports an engine or a system. The command modules do, so `--help` costs nothing
 *     and one command's dependencies are not every command's.
 */

import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { CheckCommand } from "./cli/cmd/check.ts"
import { ListPacksCommand } from "./cli/cmd/list-packs.ts"
import { ServeCommand } from "./cli/cmd/serve.ts"
import { TuiCommand } from "./cli/cmd/tui.ts"
import { ValidatePackCommand } from "./cli/cmd/validate-pack.ts"
import { UsageError } from "./cli/system.ts"

const VERSION = "0.1.0"

const cli = yargs(hideBin(process.argv))
  .parserConfiguration({ "populate--": true })
  .scriptName("reasonsmith")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", VERSION)
  .alias("version", "v")
  .usage(
    "\nreasonsmith — assess a system against a regulation pack, and report what the evidence\n" +
      "actually supports. A verdict carries the strength of the evidence behind it, and a result\n" +
      "that claims more than it has is refused rather than rendered.\n",
  )
  .command(CheckCommand)
  .command(ListPacksCommand)
  .command(ValidatePackCommand)
  .command(ServeCommand)
  .command(TuiCommand)
  .demandCommand(1, "no command given — try `reasonsmith check --help`")
  .epilogue(
    "This is not a compliance guarantee and is not legal advice. A requirement reported without\n" +
      "a strength was not evaluated or is not applicable, and no verdict on it should be read\n" +
      "from a report.",
  )
  .fail((message, error) => {
    // A usage failure is exit 1, always. Only a violated requirement reaches exit 2, and it does
    // that from the check handler and never from here.
    if (error) throw error
    if (message) {
      process.stderr.write(`${message}\n\n`)
      cli.showHelp("error")
    }
    process.exit(1)
  })
  .strict()

try {
  await cli.parse()
} catch (error) {
  // A usage error is the caller's mistake and is reported as one sentence; anything else is this
  // tool's and gets its stack, because a stranger cannot act on a bare message.
  if (error instanceof UsageError) {
    process.stderr.write(`reasonsmith: ${error.message}\n`)
  } else {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    )
  }
  process.exitCode = 1
}
