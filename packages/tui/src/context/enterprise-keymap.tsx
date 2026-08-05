/**
 * Enterprise keymap shell — @opentui/keymap with timed leader (opencode shape).
 */

import { type ParentProps } from "solid-js"
import { type CliRenderer, type KeyEvent, type Renderable } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { KeymapProvider } from "@opentui/keymap/solid"
import { registerEscapeClearsPendingSequence, registerNeovimDisambiguation } from "@opentui/keymap/addons"
import type { Keymap } from "@opentui/keymap"

type EnterpriseKeymap = Keymap<Renderable, KeyEvent>

const keymapCache = new WeakMap<CliRenderer, EnterpriseKeymap>()

export function getEnterpriseKeymap(renderer: CliRenderer): EnterpriseKeymap {
  const cached = keymapCache.get(renderer)
  if (cached) return cached

  const keymap = createDefaultOpenTuiKeymap(renderer)
  registerNeovimDisambiguation(keymap)
  registerEscapeClearsPendingSequence(keymap)
  keymapCache.set(renderer, keymap)
  return keymap
}

export function EnterpriseKeymapProvider(props: ParentProps) {
  const renderer = useRenderer()
  const keymap = getEnterpriseKeymap(renderer)

  if (process.env.REASONSMITH_TERMINAL === "1") {
    renderer.setTerminalTitle("Reasonsmith Enterprise TUI")
  }

  return <KeymapProvider keymap={keymap}>{props.children}</KeymapProvider>
}
