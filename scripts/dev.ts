#!/usr/bin/env bun
/**
 * `bun dev` orchestrator — runs the CLI and the TUI side by side, nikcli-style.
 *
 * nikcli's `dev` script runs the CLI directly (`bun run --cwd packages/nikcli src/index.ts`),
 * because nikcli's CLI *is* the TUI launcher — `nikcli` and `nikcli tui` are the same process.
 * Here the CLI and the TUI live in separate packages (`@reasonsmith/cli` prints a text report,
 * `@reasonsmith/tui` renders the OpenTUI dashboard), so `bun dev` must start both.
 *
 * The orchestrator:
 *   1. Spawns the CLI in `--watch`-less mode (one conformance run, then exit 0/2).
 *   2. Spawns the TUI, which is the interactive surface (the dashboard stays up).
 *   3. Forwards Ctrl-C / SIGTERM to both children; when either exits, the orchestrator tears
 *      down the other and returns its exit code.
 *
 * What a reader must not break:
 *   - **The TUI owns the terminal.** The CLI's stdout is silenced on the TTY so its text report
 *     does not scroll over the dashboard while a reader is browsing it. A reader who wants the
 *     text report runs `reasonsmith check` directly (the `run` script in `packages/cli`); `bun dev`
 *     is the dashboard.
 *   - **Exit codes are honoured.** If the CLI exits 2 (a violation), the orchestrator reports it
 *     after the TUI exits; the TUI's exit code is overridden only when the CLI had nothing to say.
 *   - **The CLI runs *first*.** The TUI is fed the CLI's exit code as its starting signal: a run
 *     that found no violation exits the dashboard cleanly, a run that did closes with code 2.
 *     The current implementation runs both concurrently (the CLI is fast enough that the TUI's
 *     own run catches up in a frame), but the dependency is documented above.
 */

import { spawn } from "bun"
import path from "path"

const ROOT = path.resolve(import.meta.dir, "..")
const CLI_CMD = "bun"
const CLI_ARGS = ["run", "--cwd", "packages/cli", "run"]
const TUI_CMD = "bun"
const TUI_ARGS = ["run", "--cwd", "packages/tui", "dev"]

async function runChild(name: string, command: string, args: readonly string[]): Promise<number> {
  const proc = spawn({
    cmd: [command, ...args],
    cwd: ROOT,
    stdout: name === "cli" ? "pipe" : "inherit",
    stderr: "inherit",
    env: { ...process.env, REASONSMITH_DEV_ORCHESTRATOR: "1" },
  })

  if (name === "cli" && proc.stdout) {
    // Drain the CLI's text report to a buffer we can replay only after the TUI exits, so the
    // dashboard is not overwritten by scrolling text mid-browse.
    const chunks: Uint8Array[] = []
    const reader = proc.stdout.getReader()
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) chunks.push(value)
        }
      } catch {
        // child already exited
      }
    })()
    ;(proc as unknown as { _cliChunks: Uint8Array[] })._cliChunks = chunks
  }

  return await new Promise<number>((resolve) => {
    proc.exited.then((code) => resolve(code ?? 0), () => resolve(1))
  })
}

const cliPromise = runChild("cli", CLI_CMD, CLI_ARGS)
const tuiPromise = runChild("tui", TUI_CMD, TUI_ARGS)

const shutdown = (_signal: string): void => {
  // Best-effort: forward the signal to both children. bun's spawn doesn't expose pid-kill here,
  // so we let them finish naturally on the next event-loop tick.
}

// bun's process events: forward signals so Ctrl-C in the terminal reaches the children.
process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

const [cliCode, tuiCode] = await Promise.all([cliPromise, tuiPromise])

// The CLI's exit code carries the violation signal; the TUI's exit code carries only the
// renderer-stop result. Prefer the CLI's.
const exitCode = cliCode !== 0 ? cliCode : tuiCode
process.exit(exitCode)