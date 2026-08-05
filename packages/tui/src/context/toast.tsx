/**
 * Toast notifications — enterprise feedback for actions (nikcli/opencode shape).
 */

import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper.tsx"
import { useTheme } from "./theme.tsx"

export type ToastVariant = "info" | "ok" | "warn" | "error"

interface ToastEntry {
  readonly id: number
  readonly message: string
  readonly variant: ToastVariant
}

let nextToastId = 1

export const { use: useToast, provider: ToastProvider } = createSimpleContext({
  name: "Toast",
  init: () => {
    const [store, setStore] = createStore<{ toasts: ToastEntry[] }>({ toasts: [] })

    function dismiss(id: number) {
      setStore("toasts", (items) => items.filter((t) => t.id !== id))
    }

    function show(message: string, variant: ToastVariant = "info", durationMs = 3200) {
      const id = nextToastId++
      setStore("toasts", (items) => [...items.slice(-4), { id, message, variant }])
      setTimeout(() => dismiss(id), durationMs)
    }

    return { toasts: () => store.toasts, show, dismiss }
  },
})

export function ToastViewport() {
  const toast = useToast()
  const t = useTheme()

  const color = (variant: ToastVariant) => {
    switch (variant) {
      case "ok":
        return t.color.ok
      case "warn":
        return t.color.warn
      case "error":
        return t.color.bad
      default:
        return t.color.info
    }
  }

  return (
    <Show when={toast.toasts().length > 0}>
      <box
        position="absolute"
        bottom={2}
        right={2}
        flexDirection="column"
        gap={1}
        width={48}
        zIndex={1000}
      >
        <For each={toast.toasts()}>
          {(entry) => (
            <box
              flexDirection="row"
              width="100%"
              paddingLeft={1}
              paddingRight={1}
              borderStyle="rounded"
              borderColor={t.color.border}
              backgroundColor={t.color.surfaceRaised}
            >
              <text fg={color(entry.variant)} attributes={t.attr.bold} wrapMode="word" content={entry.message} />
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}
