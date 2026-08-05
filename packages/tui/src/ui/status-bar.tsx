/**
 * Enterprise status bar — verdict counters with mouse filter + ladder summary.
 *
 * Responsive: ladder hint and counter separators hide on narrow terminals.
 */

import { For, Show } from "solid-js"
import { CATEGORY_LABELS } from "@reasonsmith/core"
import { useLayout } from "../context/layout.tsx"
import { useReport } from "../context/report.tsx"
import { useRoute } from "../context/route.tsx"
import { useTheme } from "../context/theme.tsx"
import { matchesCategoryFilter } from "../util/matches-category.ts"
import { Clickable } from "./clickable.tsx"

interface CounterSpec {
  readonly key: string
  readonly label: string
  readonly colorKey: "textMuted" | "bad" | "ok" | "unattainable"
}

export function StatusBar() {
  const t = useTheme()
  const layout = useLayout()
  const report = useReport()
  const route = useRoute()

  const counters = (): CounterSpec[] => {
    const c = report.report.counts
    const specs: CounterSpec[] = []
    for (const [key, label] of CATEGORY_LABELS) {
      const count = c[key] ?? 0
      if (count === 0) continue
      let colorKey: CounterSpec["colorKey"] = "textMuted"
      if (key === "violated") colorKey = "bad"
      else if (key === "proved" || key === "probed" || key === "recounted" || key === "observed")
        colorKey = "ok"
      else if (key === "unattainable") colorKey = "unattainable"
      specs.push({ key, label, colorKey })
    }
    return specs
  }

  const total = () => report.report.counts.total ?? report.results().length
  const violated = () => report.report.counts.violated ?? 0
  const activeFilter = () => report.categoryFilter()

  const filterBy = (key: string) => {
    report.setCategoryFilter(activeFilter() === key ? null : key)
    route.navigate({ type: "findings" })
    const first = report.results().find((r) => matchesCategoryFilter(r, key))
    if (first) report.selectById(first.requirement_id)
  }

  const counterLabel = (counter: CounterSpec) =>
    layout.compact() ? String(report.report.counts[counter.key] ?? 0) : `${String(report.report.counts[counter.key] ?? 0)} ${counter.label}`

  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      flexShrink={0}
      paddingLeft={1}
      paddingRight={1}
      gap={1}
      borderStyle="single"
      borderColor={t.color.borderSubtle}
      backgroundColor={t.color.surface}
      minWidth={0}
    >
      <text fg={t.color.info} attributes={t.attr.bold} wrapMode="none" content="ENTERPRISE" />
      <text fg={t.color.borderSubtle} wrapMode="none" content="│" />
      <text fg={t.color.textSecondary} wrapMode="none" content={`${total()} req`} />
      <Show when={violated() > 0}>
        <Clickable cursor="pointer" onClick={() => filterBy("violated")} active={activeFilter() === "violated"}>
          <text fg={t.color.bad} attributes={t.attr.bold} wrapMode="none">
            {layout.compact() ? `${violated()}!` : `${violated()} violated`}
          </text>
        </Clickable>
      </Show>
      <Show when={!layout.compact()}>
        <text fg={t.color.borderSubtle} wrapMode="none" content="│" />
      </Show>
      <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} gap={1}>
        <For each={counters().slice(0, layout.compact() ? 3 : counters().length)}>
          {(counter, index) => (
            <>
              <Clickable
                cursor="pointer"
                active={activeFilter() === counter.key}
                onClick={() => filterBy(counter.key)}
              >
                <text fg={t.color[counter.colorKey]} wrapMode="none">
                  <b>{counterLabel(counter)}</b>
                </text>
              </Clickable>
              <Show when={!layout.compact() && index() < Math.min(counters().length, 99) - 1}>
                <text fg={t.color.borderSubtle} wrapMode="none" content="·" />
              </Show>
            </>
          )}
        </For>
      </box>
      <Show when={activeFilter()}>
        {(key) => (
          <Clickable cursor="pointer" onClick={() => report.clearCategoryFilter()}>
            <text fg={t.color.warn} wrapMode="none" content={`${key()} ✕`} />
          </Clickable>
        )}
      </Show>
      <Show when={layout.showStatusLadder()}>
        <text fg={t.color.textMuted} attributes={t.attr.dim} wrapMode="none">
          ladder: unattainable → observed → recounted → probed → proved
        </text>
      </Show>
    </box>
  )
}
