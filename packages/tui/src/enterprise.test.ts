import { describe, expect, test } from "bun:test"
import { PALETTE_IDS, getPalette, nextPalette } from "./theme/palettes.ts"
import { filterCommands, buildCommands } from "./ui/commands.ts"
import { matchesCategoryFilter } from "./util/matches-category.ts"
import { loadConfigSync, saveConfigDebounced } from "./util/config.ts"
import type { RequirementResult } from "@reasonsmith/core"

describe("enterprise palettes", () => {
  test("ships six enterprise palettes", () => {
    expect(PALETTE_IDS.length).toBe(6)
    expect(PALETTE_IDS).toContain("enterprise-dark")
    expect(PALETTE_IDS).toContain("midnight")
    expect(PALETTE_IDS).toContain("ocean")
  })

  test("cycles through all palettes", () => {
    let id = PALETTE_IDS[0]!
    const seen = new Set<string>()
    for (let i = 0; i < PALETTE_IDS.length; i++) {
      seen.add(id)
      id = nextPalette(id)
    }
    expect(seen.size).toBe(PALETTE_IDS.length)
  })

  test("verdict colours are invariant", () => {
    for (const id of PALETTE_IDS) {
      const palette = getPalette(id)
      expect(palette.chrome.bg).toBeDefined()
      expect(palette.label.length).toBeGreaterThan(0)
    }
  })
})

describe("command registry", () => {
  const ctx = {
    navigate: () => {},
    cycleAudience: () => {},
    setAudience: () => {},
    cyclePalette: () => {},
    setPalette: () => {},
    clearCategoryFilter: () => {},
    openHelp: () => {},
    openTheme: () => {},
    openSettings: () => {},
    openCommandPalette: () => {},
    quit: () => {},
  }

  test("includes enterprise navigation commands", () => {
    const commands = buildCommands(ctx)
    expect(commands.some((c) => c.id === "go-settings")).toBe(true)
    expect(commands.some((c) => c.id === "command-palette")).toBe(true)
    expect(commands.some((c) => c.id === "theme-midnight")).toBe(true)
  })

  test("filters commands by query", () => {
    const commands = buildCommands(ctx)
    const filtered = filterCommands(commands, "palette")
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.every((c) => c.label.toLowerCase().includes("palette") || c.description.toLowerCase().includes("palette") || c.keywords?.some((k) => k.includes("palette")))).toBe(true)
  })
})

describe("category filter", () => {
  const base = {
    requirement_id: "test.req",
    verdict: "satisfied",
    strength: "proved",
    evaluated: true,
    basis: "presence",
    binding: true,
  } as unknown as RequirementResult

  test("matches violated verdict", () => {
    expect(matchesCategoryFilter({ ...base, verdict: "violated", strength: null } as unknown as RequirementResult, "violated")).toBe(true)
    expect(matchesCategoryFilter(base, "violated")).toBe(false)
  })

  test("matches proved satisfied rows", () => {
    expect(matchesCategoryFilter(base, "proved")).toBe(true)
    expect(matchesCategoryFilter({ ...base, strength: "observed" } as unknown as RequirementResult, "proved")).toBe(false)
  })
})

describe("config persistence", () => {
  test("defaults include audience", () => {
    const prev = process.env.REASONSMITH_CONFIG_DIR
    process.env.REASONSMITH_CONFIG_DIR = `/tmp/reasonsmith-tui-test-${Date.now()}`
    const config = loadConfigSync()
    expect(config.audience).toBe("auditor")
    if (prev === undefined) delete process.env.REASONSMITH_CONFIG_DIR
    else process.env.REASONSMITH_CONFIG_DIR = prev
  })

  test("debounced save schedules a single flush", async () => {
    const prev = process.env.REASONSMITH_CONFIG_DIR
    process.env.REASONSMITH_CONFIG_DIR = `/tmp/reasonsmith-tui-debounce-${Date.now()}`
    saveConfigDebounced({ palette: "ocean", showStartup: true, audience: "deployer" }, 20)
    saveConfigDebounced({ palette: "midnight", showStartup: true, audience: "deployer" }, 20)
    await new Promise((r) => setTimeout(r, 80))
    const config = loadConfigSync()
    expect(config.palette).toBe("midnight")
    if (prev === undefined) delete process.env.REASONSMITH_CONFIG_DIR
    else process.env.REASONSMITH_CONFIG_DIR = prev
  })
})
