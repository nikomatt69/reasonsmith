/**
 * `reasonsmith list-packs` — the packs this build can check against.
 *
 * It reads the same registry `check` and `validate-pack` load through, so the packs this prints are
 * exactly the packs a run can name. A second, looser list would let a caller see a pack they cannot
 * then check against.
 */

import { listPacks, loadPack } from "@reasonsmith/core"

import { cmd } from "./cmd.ts"

export const ListPacksCommand = cmd({
  command: "list-packs",
  describe: "list the regulation packs this build ships",
  builder: (yargs) => yargs,
  handler: async () => {
    const names = listPacks()
    if (names.length === 0) {
      process.stdout.write("no packs are registered in this build.\n")
      return
    }
    for (const name of names) {
      const pack = loadPack(name)
      process.stdout.write(`${name}\n`)
      process.stdout.write(`    ${pack.title}\n`)
      process.stdout.write(
        `    ${pack.requirements.length} requirement(s); ` +
          `${pack.requirements.filter((r) => r.binding).length} binding\n`,
      )
    }
  },
})
