/**
 * KV context — persisted enterprise preferences (palette, startup).
 */

import { createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper.tsx"
import { type TuiConfig, loadConfigSync, saveConfig } from "../util/config.ts"
import type { PaletteId } from "../theme/palettes.ts"

interface MutableTuiConfig {
  palette?: PaletteId
  showStartup?: boolean
}

export const { use: useKV, provider: KVProvider } = createSimpleContext({
  name: "KV",
  init: () => {
    const initial = loadConfigSync()
    const [store, setStore] = createStore<MutableTuiConfig>({ ...initial })

    createEffect(() => {
      void saveConfig({ ...store })
    })

    return {
      config: store,
      palette: (): PaletteId | undefined => store.palette,
      setPalette: (id: PaletteId) => setStore("palette", id),
      showStartup: () => store.showStartup !== false,
      setShowStartup: (value: boolean) => setStore("showStartup", value),
    }
  },
})
