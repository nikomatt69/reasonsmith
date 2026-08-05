/**
 * Enterprise theme palettes — nikcli/opencode shape, reasonsmith semantics.
 *
 * Verdict colours (`ok`, `bad`, `none`, `unattainable`) are fixed across every palette:
 * satisfied is always green, violated is always red, and the third family is never either.
 * Only chrome tokens (background, surface, border, text) vary between palettes.
 */

import { RGBA } from "@opentui/core"
import type { Color } from "../theme.ts"

export type PaletteId =
  | "enterprise-dark"
  | "enterprise-light"
  | "high-contrast"
  | "midnight"
  | "ocean"
  | "slate"

export interface Palette {
  readonly id: PaletteId
  readonly label: string
  readonly description: string
  readonly chrome: {
    readonly bg: Color
    readonly surface: Color
    readonly surfaceRaised: Color
    readonly border: Color
    readonly borderSubtle: Color
    readonly borderFocus: Color
    readonly text: Color
    readonly textSecondary: Color
    readonly textMuted: Color
    readonly info: Color
    readonly warn: Color
  }
}

/** Verdict tokens — invariant across palettes. */
export const VERDICT = {
  ok: RGBA.fromHex("#52d273"),
  bad: RGBA.fromHex("#ff6b6b"),
  none: RGBA.fromHex("#8291a3"),
  unattainable: RGBA.fromHex("#c8a7ff"),
} as const

const PALETTES: Record<PaletteId, Palette> = {
  "enterprise-dark": {
    id: "enterprise-dark",
    label: "Enterprise Dark",
    description: "Default professional dark chrome — nikcli baseline.",
    chrome: {
      bg: RGBA.fromHex("#080b10"),
      surface: RGBA.fromHex("#111821"),
      surfaceRaised: RGBA.fromHex("#16202c"),
      border: RGBA.fromHex("#263344"),
      borderSubtle: RGBA.fromHex("#1a2532"),
      borderFocus: RGBA.fromHex("#6bb8ff"),
      text: RGBA.fromHex("#edf4fb"),
      textSecondary: RGBA.fromHex("#b9c7d6"),
      textMuted: RGBA.fromHex("#6f7f90"),
      info: RGBA.fromHex("#6bb8ff"),
      warn: RGBA.fromHex("#e6b450"),
    },
  },
  "enterprise-light": {
    id: "enterprise-light",
    label: "Enterprise Light",
    description: "Light terminal chrome for bright environments.",
    chrome: {
      bg: RGBA.fromHex("#f4f6f9"),
      surface: RGBA.fromHex("#ffffff"),
      surfaceRaised: RGBA.fromHex("#e8edf3"),
      border: RGBA.fromHex("#c5d0dc"),
      borderSubtle: RGBA.fromHex("#dce3eb"),
      borderFocus: RGBA.fromHex("#2563eb"),
      text: RGBA.fromHex("#0f172a"),
      textSecondary: RGBA.fromHex("#334155"),
      textMuted: RGBA.fromHex("#64748b"),
      info: RGBA.fromHex("#2563eb"),
      warn: RGBA.fromHex("#b45309"),
    },
  },
  "high-contrast": {
    id: "high-contrast",
    label: "High Contrast",
    description: "Maximum legibility — accessibility-first enterprise mode.",
    chrome: {
      bg: RGBA.fromHex("#000000"),
      surface: RGBA.fromHex("#0a0a0a"),
      surfaceRaised: RGBA.fromHex("#1a1a1a"),
      border: RGBA.fromHex("#ffffff"),
      borderSubtle: RGBA.fromHex("#666666"),
      borderFocus: RGBA.fromHex("#00ffff"),
      text: RGBA.fromHex("#ffffff"),
      textSecondary: RGBA.fromHex("#e0e0e0"),
      textMuted: RGBA.fromHex("#aaaaaa"),
      info: RGBA.fromHex("#00ffff"),
      warn: RGBA.fromHex("#ffff00"),
    },
  },
  midnight: {
    id: "midnight",
    label: "Midnight",
    description: "Deep indigo enterprise chrome for low-light terminals.",
    chrome: {
      bg: RGBA.fromHex("#0a0a14"),
      surface: RGBA.fromHex("#12121f"),
      surfaceRaised: RGBA.fromHex("#1a1a2e"),
      border: RGBA.fromHex("#2d2d4a"),
      borderSubtle: RGBA.fromHex("#1f1f35"),
      borderFocus: RGBA.fromHex("#7c8aff"),
      text: RGBA.fromHex("#e8e8f0"),
      textSecondary: RGBA.fromHex("#b8b8d0"),
      textMuted: RGBA.fromHex("#686880"),
      info: RGBA.fromHex("#7c8aff"),
      warn: RGBA.fromHex("#ffb347"),
    },
  },
  ocean: {
    id: "ocean",
    label: "Ocean",
    description: "Cool teal enterprise palette for extended review sessions.",
    chrome: {
      bg: RGBA.fromHex("#061418"),
      surface: RGBA.fromHex("#0c2228"),
      surfaceRaised: RGBA.fromHex("#123038"),
      border: RGBA.fromHex("#1e4a56"),
      borderSubtle: RGBA.fromHex("#153540"),
      borderFocus: RGBA.fromHex("#4ecdc4"),
      text: RGBA.fromHex("#e0f2f1"),
      textSecondary: RGBA.fromHex("#a8c5c2"),
      textMuted: RGBA.fromHex("#5a8080"),
      info: RGBA.fromHex("#4ecdc4"),
      warn: RGBA.fromHex("#ffd166"),
    },
  },
  slate: {
    id: "slate",
    label: "Slate",
    description: "Neutral grey enterprise chrome — vendor-neutral dashboards.",
    chrome: {
      bg: RGBA.fromHex("#121416"),
      surface: RGBA.fromHex("#1a1d21"),
      surfaceRaised: RGBA.fromHex("#22262c"),
      border: RGBA.fromHex("#3a4048"),
      borderSubtle: RGBA.fromHex("#282c32"),
      borderFocus: RGBA.fromHex("#94a3b8"),
      text: RGBA.fromHex("#f1f5f9"),
      textSecondary: RGBA.fromHex("#cbd5e1"),
      textMuted: RGBA.fromHex("#64748b"),
      info: RGBA.fromHex("#94a3b8"),
      warn: RGBA.fromHex("#fbbf24"),
    },
  },
}

export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[]

export function getPalette(id: PaletteId): Palette {
  return PALETTES[id]
}

export function nextPalette(id: PaletteId): PaletteId {
  const index = PALETTE_IDS.indexOf(id)
  return PALETTE_IDS[(index + 1) % PALETTE_IDS.length]!
}
