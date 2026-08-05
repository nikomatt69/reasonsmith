/**
 * The one helper every command module is declared through.
 *
 * Taken from nikcli's `src/cli/cmd/cmd.ts`: it is a typed identity function over yargs'
 * `CommandModule`, so a command file exports a value rather than reaching into the yargs instance,
 * and `src/index.ts` wires them by name. Nothing here does any work at import time — a command
 * module that ran something on import would run it for every other command too.
 */

import type { CommandModule } from "yargs"

type WithDoubleDash<T> = T & { "--"?: string[] }

export function cmd<T, U>(input: CommandModule<T, WithDoubleDash<U>>) {
  return input
}
