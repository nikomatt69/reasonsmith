import "@reasonsmith/core"
import "@reasonsmith/engines"
import { createCliRenderer } from "@opentui/core"
import { render } from "@opentui/solid"
import { checkConformance, loadPack } from "@reasonsmith/core"
import { deployedCreditSystem } from "@reasonsmith/systems"
import { tui } from "./app.tsx"
import "@opentui/solid/jsx-runtime"

const pack = loadPack("ecoa")!
const sys = deployedCreditSystem()
const report = checkConformance(sys, pack, { systemName: sys.name })
console.log("about to call tui(report)…")
try {
  await tui(report)
  console.log("tui() resolved cleanly")
} catch (e) {
  console.log("tui() rejected:", e instanceof Error ? e.message.slice(0,150) : String(e).slice(0,150))
}
process.exit(0)
