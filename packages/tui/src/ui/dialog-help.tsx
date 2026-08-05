/**
 * Help dialog — full enterprise keybindings and audiences.
 */

import { For, createMemo } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { Audience } from "@reasonsmith/core"
import { useDialog } from "./dialog.tsx"
import { BINDINGS, useKeybind } from "../context/keybind.tsx"
import { useReport } from "../context/report.tsx"
import { useTheme } from "../context/theme.tsx"
import { AUDIENCE_HELP, AUDIENCE_LABELS } from "./audiences.ts"
import { Button } from "./button.tsx"
import { Clickable } from "./clickable.tsx"
import { ModalPanel } from "./modal-panel.tsx"

export function DialogHelp() {
  const dialog = useDialog()
  const keybind = useKeybind()
  const report = useReport()
  const t = useTheme()

  const shortcutRows = createMemo(() =>
    BINDINGS.filter((b) => !b.leader).map((binding) => ({
      keys: binding.keys,
      label: binding.label,
    })),
  )

  const leaderRows = createMemo(() =>
    BINDINGS.filter((b) => b.leader).map((binding) => ({
      keys: `ctrl+x ${binding.keys.split(" ")[0] ?? binding.keys}`,
      label: binding.label,
    })),
  )

  const audienceRows = createMemo(() =>
    report.audiences.map((a) => ({
      audience: a as Audience,
      name: AUDIENCE_LABELS[a as Audience] ?? a,
      description: AUDIENCE_HELP[a as Audience] ?? "",
    })),
  )

  return (
    <ModalPanel title="Help" subtitle="enterprise keymap · audiences · command palette (ctrl+p)" stackDepth={dialog.stack().length} width={82}>
      <box flexDirection="row" gap={3} paddingTop={1}>
        <box flexDirection="column" gap={1} flexGrow={1}>
          <text fg={t.color.info} attributes={t.attr.bold} wrapMode="none" content="Global shortcuts" />
          <For each={shortcutRows()}>
            {(row) => (
              <box flexDirection="row" gap={1}>
                <text fg={t.color.text} attributes={TextAttributes.BOLD} wrapMode="none" width={16} content={row.keys} />
                <text fg={t.color.textMuted} wrapMode="none" content={row.label} />
              </box>
            )}
          </For>
          <text fg={t.color.info} attributes={t.attr.bold} wrapMode="none" content="Leader (ctrl+x, 2s)" />
          <For each={leaderRows()}>
            {(row) => (
              <box flexDirection="row" gap={1}>
                <text fg={t.color.text} attributes={TextAttributes.BOLD} wrapMode="none" width={16} content={row.keys} />
                <text fg={t.color.textMuted} wrapMode="none" content={row.label} />
              </box>
            )}
          </For>
          <text fg={t.color.textMuted} wrapMode="none" content={`@opentui/keymap · ${keybind.formatKey("<leader>")} leader token`} />
        </box>

        <box flexDirection="column" gap={1} flexGrow={1}>
          <text fg={t.color.info} attributes={t.attr.bold} wrapMode="none" content="Audiences" />
          <For each={audienceRows()}>
            {(row) => (
              <Clickable
                cursor="pointer"
                flexDirection="column"
                onClick={() => report.setAudience(row.audience)}
              >
                <text fg={t.color.text} attributes={TextAttributes.BOLD} wrapMode="none" content={row.name} />
                <text fg={t.color.textMuted} wrapMode="none" content={row.description} />
              </Clickable>
            )}
          </For>
        </box>
      </box>

      <box flexDirection="row" justifyContent="flex-end" paddingTop={1}>
        <Button label="OK" onClick={() => dialog.pop()} />
      </box>
    </ModalPanel>
  )
}
