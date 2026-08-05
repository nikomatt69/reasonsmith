/**
 * The built-in packs, registered with the loader.
 *
 * `src/reasonsmith/packs/*.toml` are *derived, not authored*: the regulation packs quote
 * `docs/legal-sources.md`, which is the retrieval record for the official statutory text. The
 * Table 7 pack restates `src/reasonsmith/table7.toml`. These modules restate the same rows, and
 * the fields are kept verbatim on purpose — a quote checked against the print is the only thing
 * keeping a pack attached to the law it names.
 *
 * The current ports are placeholders: 1–2 requirements per pack carry the verbatim quotation
 * from the source TOML, with the `spec` reduced to a trivial presence check. The full signal
 * fan and per-row requirement body are pending the upstream port.
 */

import { Pack, registerPack } from "../spec.ts"
import { ecoaPack } from "./ecoa.ts"
import { table7Pack } from "./table7.ts"
import { euAiActPack } from "./eu-ai-act.ts"
import { gdprPack } from "./gdpr.ts"

let installed = false

/** Register every built-in pack. Idempotent; called by the package barrel. */
export function registerBuiltinPacks(): void {
  if (installed) return
  installed = true
  registerPack("ecoa", () => new Pack(ecoaPack()))
  registerPack("table7", () => new Pack(table7Pack()))
  registerPack("eu-ai-act", () => new Pack(euAiActPack()))
  registerPack("gdpr", () => new Pack(gdprPack()))
}

export { ecoaPack, table7Pack, euAiActPack, gdprPack }
