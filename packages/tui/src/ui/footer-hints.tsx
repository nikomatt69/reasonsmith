/**
 * The footer hint bar — keybindings for the active route, capped on narrow terminals.
 */

import { For, Show, createMemo } from "solid-js"
import { useLayout } from "../context/layout.tsx"
import { useKeybind } from "../context/keybind.tsx"
import { useReport } from "../context/report.tsx"
import { useRoute } from "../context/route.tsx"
import { useTheme } from "../context/theme.tsx"
import { Clickable } from "./clickable.tsx"

export function FooterHints() {
  const t = useTheme()
  const layout = useLayout()
  const keybind = useKeybind()
  const route = useRoute()
  const report = useReport()

  const shown = createMemo(() => {
    const bindings = keybind.bindings.filter((b) => b.on.includes(route.route().type))
    return bindings.slice(0, layout.maxFooterHints())
  })

  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      paddingLeft={1}
      paddingRight={1}
      gap={1}
      borderStyle="rounded"
      borderColor={t.color.borderSubtle}
      title="keys"
      titleAlignment="left"
      minWidth={0}
    >
      <For each={shown()}>
        {(binding, index) => (
          <Clickable
            cursor="pointer"
            flexDirection="row"
            gap={1}
            paddingLeft={1}
            paddingRight={1}
            onClick={() => keybind.click(binding.label)}
          >
            <text fg={t.color.text} wrapMode="none">
              <b>{binding.keys}</b>
            </text>
            <Show when={!layout.compact()}>
              <text fg={t.color.textMuted} wrapMode="none">
                <i>{binding.label}</i>
              </text>
            </Show>
            <Show when={index() < shown().length - 1}>
              <text fg={t.color.borderSubtle} wrapMode="none" content="·" />
            </Show>
          </Clickable>
        )}
      </For>
      <box flexGrow={1} minWidth={0} />
      <Show when={keybind.leader()}>
        <text fg={t.color.warn} attributes={t.attr.bold} wrapMode="none" content="LEADER " />
      </Show>
      <text fg={t.color.info} wrapMode="none">
        <Show when={!layout.compact()} fallback={<b>{report.audience()}</b>}>
          for: <b>{report.audience()}</b>
        </Show>
      </text>
    </box>
  )
}
