/**
 * KV context — persisted enterprise preferences (palette, startup, audience).
 */

import { createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import type { Audience } from "@reasonsmith/core"
import { createSimpleContext } from "./helper.tsx"
import { type TuiConfig, loadConfigSync, saveConfigDebounced } from "../util/config.ts"
import type { PaletteId } from "../theme/palettes.ts"

interface MutableTuiConfig {
  palette?: PaletteId
  showStartup?: boolean
  audience?: Audience
}

export const { use: useKV, provider: KVProvider } = createSimpleContext({
  name: "KV",
  init: () => {
    const initial = loadConfigSync()
    const [store, setStore] = createStore<MutableTuiConfig>({ ...initial })

    createEffect(() => {
      saveConfigDebounced({ ...store } satisfies TuiConfig)
    })

    return {
      config: store,
      palette: (): PaletteId | undefined => store.palette,
      setPalette: (id: PaletteId) => setStore("palette", id),
      audience: (): Audience | undefined => store.audience,
      setAudience: (value: Audience) => setStore("audience", value),
      showStartup: () => store.showStartup !== false,
      setShowStartup: (value: boolean) => setStore("showStartup", value),
    }
  },
})
