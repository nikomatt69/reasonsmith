/**
 * ExitProvider — the single place this TUI hands control back to the host process.
 *
 * Mirrors nikcli's `src/cli/cmd/tui/context/exit.tsx`. The shape of `init` and the public
 * surface (`exit`, `restart`, `setSummary`) are deliberately identical so a future
 * re-sync against the reference is a one-step diff.
 *
 * Exit-code contract:
 *   - This module **never** calls `process.exit`. Destroying the renderer returns control to
 *     `tui()` in `app.tsx`, which lets `index.tsx` apply the conformance exit code (`2` on
 *     violation) after the session ends.
 *   - `exit(reason)` sets `process.exitCode = 1` when `reason` is truthy or teardown throws.
 *   - A code of `2` is the conformance tool's signal for a *violated* requirement and
 *     intentionally belongs with the run, not with the UI.
 *
 * Terminal restoration:
 *   - On exit we clear the terminal title, destroy the renderer, and restore whatever
 *     raw-mode state the TUI took.
 *
 * Re-entry:
 *   - An `exiting` flag short-circuits a second call to either `exit` or `restart`.
 */

import { useRenderer } from "@opentui/solid"
import { createSimpleContext } from "./helper"

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export const { use: useExit, provider: ExitProvider } = createSimpleContext({
  name: "Exit",
  init: (input: {
    onExit?: () => Promise<void>
    onBeforeExit?: () => Promise<void>
    onRestart?: () => Promise<void>
  }) => {
    const renderer = useRenderer()
    let exiting = false
    let summary: (() => string | undefined) | undefined

    const writeSummary = () => {
      const text = summary?.()
      if (!text) return
      process.stdout.write(text + "\n")
    }

    const exit = async (reason?: unknown) => {
      if (exiting) return
      exiting = true

      const errors: unknown[] = reason ? [reason] : []
      if (reason) process.exitCode = 1

      try {
        await input.onBeforeExit?.()
      } catch (error) {
        errors.push(error)
        process.exitCode = 1
      }

      try {
        renderer.setTerminalTitle("")
        renderer.destroy()
        if (!reason) writeSummary()
      } catch (error) {
        errors.push(error)
        process.exitCode = 1
      }

      try {
        await input.onExit?.()
      } catch (error) {
        errors.push(error)
        process.exitCode = 1
      }

      for (const error of errors) {
        process.stderr.write(formatError(error) + "\n")
      }
    }

    const restart = async () => {
      if (exiting) return
      exiting = true

      try {
        await input.onBeforeExit?.()
      } catch {
        // best effort
      }

      try {
        renderer.setTerminalTitle("")
        renderer.destroy()
      } catch {
        // best effort
      }

      try {
        await input.onExit?.()
      } catch {
        // best effort
      }

      await input.onRestart?.()
    }

    return {
      exit,
      restart,
      setSummary(fn: () => string | undefined) {
        summary = fn
      },
    }
  },
})
