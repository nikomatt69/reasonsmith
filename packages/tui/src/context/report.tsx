/**
 * The report context: the run this TUI is showing, and who it is being shown to.
 *
 * Selection is keyed by `requirement_id` so filters never desync the highlighted row.
 * Text and category filters live here so they survive route changes within the session.
 */

import { createEffect, createMemo, createSignal } from "solid-js"
import {
  AUDIENCES,
  type Audience,
  type AudienceProjection,
  type ConformanceReport,
  PROJECTIONS,
  type RequirementResult,
} from "@reasonsmith/core"
import { createSimpleContext } from "./helper.tsx"
import { useKV } from "./kv.tsx"
import { matchesCategoryFilter } from "../util/matches-category.ts"

function initialAudience(kv: ReturnType<typeof useKV>, report: ConformanceReport): Audience {
  const saved = kv.audience()
  if (saved && AUDIENCES.includes(saved)) return saved
  return "auditor"
}

export const { use: useReport, provider: ReportProvider } = createSimpleContext({
  name: "Report",
  init: (props: { report: ConformanceReport }) => {
    const kv = useKV()
    const report = props.report
    const [audience, setAudienceSignal] = createSignal<Audience>(initialAudience(kv, report))
    const [selectedId, setSelectedId] = createSignal<string | null>(
      report.results[0]?.requirement_id ?? null,
    )
    const [categoryFilter, setCategoryFilter] = createSignal<string | null>(null)
    const [textFilter, setTextFilter] = createSignal("")

    const results = (): readonly RequirementResult[] => report.results
    const view = createMemo<AudienceProjection>(() => PROJECTIONS[audience()])

    const filteredResults = createMemo(() => {
      const query = textFilter().trim().toLowerCase()
      const category = categoryFilter()
      let rows = results()
      if (query !== "") {
        rows = rows.filter((r) => r.requirement_id.toLowerCase().includes(query))
      }
      if (category) {
        rows = rows.filter((r) => matchesCategoryFilter(r, category))
      }
      return rows
    })

    createEffect(() => {
      kv.setAudience(audience())
    })

    const resolveSelectedIndex = (rows: readonly RequirementResult[]): number => {
      const id = selectedId()
      if (id) {
        const index = rows.findIndex((r) => r.requirement_id === id)
        if (index >= 0) return index
      }
      return rows.length > 0 ? 0 : -1
    }

    const selectedIndex = createMemo(() => resolveSelectedIndex(filteredResults()))

    createEffect(() => {
      const rows = filteredResults()
      const index = resolveSelectedIndex(rows)
      if (index >= 0) {
        const id = rows[index]?.requirement_id
        if (id && id !== selectedId()) setSelectedId(id)
      } else if (rows.length === 0 && selectedId() !== null) {
        setSelectedId(null)
      }
    })

    const current = (): RequirementResult | null => {
      const id = selectedId()
      if (id) {
        const match = results().find((r) => r.requirement_id === id)
        if (match) return match
      }
      return filteredResults()[0] ?? results()[0] ?? null
    }

    const selectById = (id: string) => setSelectedId(id)

    const select = (index: number) => {
      const rows = filteredResults()
      const row = rows[index]
      if (row) setSelectedId(row.requirement_id)
    }

    const move = (delta: number) => {
      const rows = filteredResults()
      if (rows.length === 0) return
      const index = resolveSelectedIndex(rows)
      const next = Math.min(Math.max(index + delta, 0), rows.length - 1)
      const row = rows[next]
      if (row) setSelectedId(row.requirement_id)
    }

    const setAudience = (value: Audience) => setAudienceSignal(value)

    return {
      report,
      results,
      filteredResults,
      audience,
      view,
      selectedId,
      selectedIndex,
      current,
      select,
      selectById,
      next: () => move(1),
      previous: () => move(-1),
      first: () => {
        const first = filteredResults()[0]
        if (first) setSelectedId(first.requirement_id)
      },
      last: () => {
        const rows = filteredResults()
        const last = rows[rows.length - 1]
        if (last) setSelectedId(last.requirement_id)
      },
      setAudience,
      cycleAudience: () =>
        setAudienceSignal((a) => AUDIENCES[(AUDIENCES.indexOf(a) + 1) % AUDIENCES.length]),
      categoryFilter,
      setCategoryFilter,
      clearCategoryFilter: () => setCategoryFilter(null),
      textFilter,
      setTextFilter,
      clearTextFilter: () => setTextFilter(""),
      audiences: AUDIENCES,
    }
  },
})
