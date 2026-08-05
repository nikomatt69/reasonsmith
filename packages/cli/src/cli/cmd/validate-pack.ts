/**
 * `reasonsmith validate-pack` — print what a pack contains, or refuse it naming what is at fault.
 *
 * What a reader must not break:
 *   - It reuses the pack loader exactly, so the packs a `check` run can load are exactly the packs
 *     this accepts. The front door must not have a second, looser idea of a valid pack that a
 *     stranger could validate a pack with and then fail to check against.
 *   - Exit 0 when every pack loaded and printed; exit 1 for a pack the loader refuses, naming the
 *     pack and the requirement at fault. The exit code means "the loader accepted this pack" and
 *     nothing else.
 *   - The two fields no engine reads — `deontic_type` and `defeasibility` — are printed anyway.
 *     They exist to make the shape of a pack countable, and a listing that hid them would make the
 *     count unavailable to the one reader who wants it.
 */

import { listPacks, loadPack } from "@reasonsmith/core"

import { cmd } from "./cmd.ts"

export const ValidatePackCommand = cmd({
  command: "validate-pack <pack..>",
  describe: "validate a requirement pack and print what it contains",
  builder: (yargs) =>
    yargs.positional("pack", {
      type: "string",
      array: true,
      demandOption: true,
      describe: `pack name. Built-in packs: ${listPacks().join(", ")}`,
    }),
  handler: async (args) => {
    const names = (args.pack as string[]) ?? []
    let failed = false

    for (const name of names) {
      let pack
      try {
        pack = loadPack(name)
      } catch (error) {
        failed = true
        process.stderr.write(
          `refused: ${name}: ${error instanceof Error ? error.message : String(error)}\n`,
        )
        continue
      }

      process.stdout.write(`${pack.id} — ${pack.title}\n`)
      process.stdout.write(`  ${pack.description}\n`)
      process.stdout.write(`  ${pack.requirements.length} requirement(s)\n\n`)
      for (const req of pack.requirements) {
        process.stdout.write(`  ${req.id}\n`)
        process.stdout.write(`      clause:       ${req.source_document} ${req.article_clause}\n`)
        process.stdout.write(`      formalism:    ${req.formalism}\n`)
        process.stdout.write(`      spec:         ${req.spec}\n`)
        process.stdout.write(`      binding:      ${req.binding}\n`)
        process.stdout.write(`      scope:        ${req.scope || "(not class-limited)"}\n`)
        process.stdout.write(
          `      domains:      ${req.domains.length > 0 ? req.domains.join(", ") : "(not domain-limited)"}\n`,
        )
        process.stdout.write(`      deontic type: ${req.deontic_type}\n`)
        process.stdout.write(`      defeasibility:${req.defeasibility}\n`)
        process.stdout.write(`      requires:     ${req.requires.join(", ")}\n\n`)
      }
    }

    if (failed) process.exitCode = 1
  },
})
