/**
 * The theme context — enterprise palettes with invariant verdict semantics + KV persistence.
 */

import { createEffect, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper.tsx"
import { useKV } from "./kv.tsx"
import { A, resultTone, strengthWord } from "../theme.ts"
import {
  type PaletteId,
  VERDICT,
  getPalette,
  nextPalette,
  PALETTE_IDS,
  type Palette,
} from "../theme/palettes.ts"

function chromeFor(id: PaletteId) {
  return { ...getPalette(id).chrome, ...VERDICT }
}

function initialPalette(kv: ReturnType<typeof useKV>): PaletteId {
  const saved = kv.palette()
  if (saved && PALETTE_IDS.includes(saved)) return saved
  return "enterprise-dark"
}

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: () => {
    const kv = useKV()
    const [paletteId, setPaletteId] = createSignal<PaletteId>(initialPalette(kv))
    const [color, setColor] = createStore(chromeFor(paletteId()))

    createEffect(() => {
      setColor(chromeFor(paletteId()))
      kv.setPalette(paletteId())
    })

    const palettes = (): readonly Palette[] => PALETTE_IDS.map((id) => getPalette(id))

    return {
      paletteId,
      palettes,
      setPalette: setPaletteId,
      cyclePalette: () => setPaletteId((id) => nextPalette(id)),
      color,
      attr: A,
      resultTone,
      strengthWord,
    }
  },
})
