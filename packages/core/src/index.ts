/**
 * `@reasonsmith/core` — the domain: the property language, the pack model, the result model with its
 * construction-time invariants, the two applicability gates, the unattainable analysis, the engine
 * ladder, and the reason-deletion certificate.
 *
 * The one rule that shapes all of it: **no emitted record, certificate or measurement may present
 * itself as complete when it is not, and every one carries its own limits.** In this version that
 * rule is structural — a verdict carries the strength of the evidence behind it, and
 * `RequirementResult` refuses to construct a result that claims more than it has.
 *
 * Importing this module registers the built-in packs, so `loadPack("ecoa")` works without a second
 * call. It installs no engines: a build with no `@reasonsmith/engines` import has an empty ladder
 * and reports every duty not evaluated, which is the honest answer for a build that has no engines.
 */

import { registerBuiltinPacks } from "./packs/index.ts"

registerBuiltinPacks()

export * from "./verdict.ts"
export * from "./language.ts"
export * from "./spec.ts"
export * from "./sut.ts"
export * from "./artifacts.ts"
export * from "./explanations.ts"
export * from "./certificate.ts"
export * from "./report.ts"
export * from "./engine-registry.ts"
export * from "./check-conformance.ts"
export * from "./render.ts"
export { registerBuiltinPacks, ecoaPack } from "./packs/index.ts"
