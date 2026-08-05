/**
 * The top bar — the masthead, in nikcli's tab-bar shape.
 *
 * Responsive: ASCII brand hides on narrow terminals; notice wraps to terminal width.
 */

import { For, Show, createSignal } from "solid-js"
import { useLayout } from "../context/layout.tsx"
import { useReport } from "../context/report.tsx"
import { useRoute } from "../context/route.tsx"
import { useKeybind } from "../context/keybind.tsx"
import { useTheme } from "../context/theme.tsx"
import { wrap } from "../theme.ts"
import { Clickable } from "./clickable.tsx"

const TABS = [
  { type: "findings", label: "Findings" },
  { type: "detail", label: "Detail" },
  { type: "packs", label: "Packs" },
  { type: "systems", label: "Systems" },
  { type: "limits", label: "Limits" },
  { type: "settings", label: "Settings" },
] as const

export function ReportHeader() {
  const t = useTheme()
  const layout = useLayout()
  const route = useRoute()
  const report = useReport()
  const keybind = useKeybind()
  const notice = () => report.report.undeclaredDomainNotice
  const [hovered, setHovered] = createSignal<string | null>(null)

  const visibleTabs = () =>
    layout.compact()
      ? TABS.filter((tab) => tab.type === "findings" || tab.type === "settings" || route.route().type === tab.type)
      : TABS

  return (
    <box
      flexDirection="column"
      width="100%"
      flexShrink={0}
      backgroundColor={t.color.surface}
      borderStyle="single"
      borderColor={t.color.borderSubtle}
      paddingLeft={1}
      paddingRight={1}
    >
      <box flexDirection="row" height={3} width="100%" minWidth={0}>
        <Show when={layout.showAsciiBrand()}>
          <ascii_font text="REASONSMITH" font="tiny" color={t.color.info} />
          <text fg={t.color.borderSubtle} wrapMode="none">
            {"  "}
            {SEPARATOR.vertical}
            {"  "}
          </text>
        </Show>
        <Show when={!layout.showAsciiBrand()}>
          <text fg={t.color.info} attributes={t.attr.bold} wrapMode="none" content="RS" />
          <text fg={t.color.borderSubtle} wrapMode="none" content=" │ " />
        </Show>
        <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1}>
          <For each={visibleTabs()}>
            {(tab) => (
              <Tab
                label={tab.label}
                active={route.route().type === tab.type}
                hovered={hovered() === tab.type}
                onHover={() => setHovered(tab.type)}
                onLeave={() => setHovered((cur) => (cur === tab.type ? null : cur))}
                onClick={() => route.navigate({ type: tab.type })}
              />
            )}
          </For>
        </box>
        <Show when={layout.showHeaderMeta()}>
          <Clickable cursor="pointer" onClick={() => keybind.openCommandPalette()}>
            <text fg={t.color.textMuted} wrapMode="none" content="ctrl+p" />
          </Clickable>
        </Show>
      </box>

      <box flexDirection="row" height={1} width="100%" minWidth={0}>
        <text fg={t.color.textSecondary} wrapMode="none" flexShrink={1} minWidth={0}>
          {report.report.system_name}
        </text>
        <Show when={layout.showHeaderMeta()}>
          <text fg={t.color.borderSubtle} wrapMode="none">
            {"  "}
            {SEPARATOR.dot}
            {"  "}
          </text>
          <text fg={t.color.textMuted} wrapMode="none" attributes={t.attr.dim}>
            pack {report.report.pack_id}
          </text>
          <text fg={t.color.borderSubtle} wrapMode="none">
            {"  "}
            {SEPARATOR.dot}
            {"  "}
          </text>
          <text fg={t.color.textMuted} wrapMode="none" attributes={t.attr.dim}>
            {report.report.results.length} req
          </text>
        </Show>
        <box flexGrow={1} minWidth={0} />
        <Clickable cursor="pointer" onClick={() => report.cycleAudience()}>
          <text fg={t.color.info} wrapMode="none">
            for: <b>{report.audience()}</b>
          </text>
        </Clickable>
      </box>

      <Show when={report.view().headline && layout.showHeaderMeta()}>
        <box flexDirection="row" height={1} minWidth={0}>
          <text fg={t.color.textSecondary} wrapMode="none" flexShrink={1} minWidth={0}>
            {report.report.headline}
          </text>
        </box>
      </Show>

      <Show when={notice()}>
        {(text) => (
          <box flexDirection="column" marginTop={0} marginBottom={1}>
            <For each={wrap(text(), layout.wrapWidth())}>
              {(line) => <text fg={t.color.warn} wrapMode="none" content={line} />}
            </For>
          </box>
        )}
      </Show>
    </box>
  )
}

const SEPARATOR = {
  horizontal: "─",
  vertical: "│",
  dot: "·",
} as const

function Tab(props: {
  label: string
  active: boolean
  hovered: boolean
  onHover: () => void
  onLeave: () => void
  onClick: () => void
  accent?: boolean
}) {
  const t = useTheme()
  const fg = () => {
    if (props.active) return t.color.text
    if (props.hovered) return t.color.textSecondary
    return props.accent ? t.color.info : t.color.textMuted
  }
  return (
    <Clickable
      cursor="pointer"
      paddingLeft={1}
      paddingRight={1}
      active={props.active}
      onClick={props.onClick}
      onHover={props.onHover}
      onLeave={props.onLeave}
    >
      <text
        fg={fg()}
        attributes={props.active ? t.attr.bold : t.attr.none}
        wrapMode="none"
      >
        {props.label}
      </text>
    </Clickable>
  )
}
