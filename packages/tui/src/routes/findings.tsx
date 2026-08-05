/**
 * The findings route: every requirement result, one row each.
 */

import { For, Show } from "solid-js"
import type { RequirementResult } from "@reasonsmith/core"
import { useReport } from "../context/report.tsx"
import { useRoute } from "../context/route.tsx"
import { useTheme } from "../context/theme.tsx"
import { RoutePanel } from "../ui/route-panel.tsx"
import { VerdictChip } from "../ui/verdict-chip.tsx"
import { Clickable } from "../ui/clickable.tsx"

export function Findings() {
  const t = useTheme()
  const report = useReport()
  const route = useRoute()

  return (
    <RoutePanel title={`Findings (${report.results().length})`} scroll={false} padded={false}>
      <box
        flexDirection="row"
        flexShrink={0}
        width="100%"
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        gap={1}
      >
        <text fg={t.color.textMuted} attributes={t.attr.dim} wrapMode="none" content="filter:" />
        <input
          flexGrow={1}
          minWidth={0}
          placeholder="requirement id substring…"
          backgroundColor={t.color.surface}
          focusedBackgroundColor={t.color.surfaceRaised}
          textColor={t.color.text}
          cursorColor={t.color.info}
          value={report.textFilter()}
          onInput={(value) => report.setTextFilter(value)}
        />
      </box>
      <scrollbox
        flexGrow={1}
        minHeight={0}
        width="100%"
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={t.color.bg}
        verticalScrollbarOptions={{
          showArrows: true,
          trackOptions: {
            foregroundColor: t.color.info,
            backgroundColor: t.color.surface,
          },
        }}
        scrollbarOptions={{
          showArrows: true,
          trackOptions: {
            foregroundColor: t.color.info,
            backgroundColor: t.color.surface,
          },
        }}
      >
        <Show
          when={report.filteredResults().length > 0}
          fallback={
            <text
              fg={t.color.textMuted}
              attributes={t.attr.dim}
              wrapMode="none"
              content={
                report.textFilter().trim() !== ""
                  ? `no requirement matches "${report.textFilter()}"`
                  : "no requirements match the active filter"
              }
            />
          }
        >
          <For each={report.filteredResults()}>
            {(result) => (
              <Row
                result={result}
                selected={result.requirement_id === report.selectedId()}
                onHover={() => report.selectById(result.requirement_id)}
                onOpen={() => {
                  report.selectById(result.requirement_id)
                  route.navigate({ type: "detail" })
                }}
              />
            )}
          </For>
        </Show>
      </scrollbox>
    </RoutePanel>
  )
}

function Row(props: { result: RequirementResult; selected: boolean; onHover: () => void; onOpen: () => void }) {
  const t = useTheme()
  const report = useReport()

  return (
    <Clickable
      cursor="pointer"
      flexDirection="row"
      gap={1}
      height={1}
      width="100%"
      active={props.selected}
      onClick={props.onHover}
      onDoubleClick={props.onOpen}
    >
      <text
        fg={props.selected ? t.color.info : t.color.borderSubtle}
        wrapMode="none"
        content={props.selected ? "▌" : " "}
      />
      <VerdictChip
        verdict={props.result.verdict}
        strength={props.result.strength}
        showStrength={report.view().strength}
        bold={props.selected}
      />
      <text
        fg={props.selected ? t.color.text : t.color.textSecondary}
        wrapMode="none"
        flexGrow={1}
        minWidth={0}
      >
        <span>
          {props.selected ? <b>{props.result.requirement_id}</b> : props.result.requirement_id}
        </span>
      </text>
      <Show when={report.view().classification}>
        <text
          fg={t.color.textMuted}
          attributes={t.attr.dim}
          wrapMode="none"
          flexShrink={0}
          width={12}
          content={props.result.binding ? "binding" : "interpretive"}
        />
      </Show>
    </Clickable>
  )
}
