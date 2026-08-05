/**
 * The route context: which of the screens is showing.
 *
 * Clears category filter when leaving findings so status-bar chips do not look active
 * on routes where the filter has no effect. Detail navigation requires a selection.
 */

import { createSignal } from "solid-js"
import { useReport } from "./report.tsx"
import { createSimpleContext } from "./helper.tsx"

export type Route =
  | { type: "findings" }
  | { type: "detail" }
  | { type: "limits" }
  | { type: "packs" }
  | { type: "systems" }
  | { type: "settings" }

export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: () => {
    const report = useReport()
    const [route, setRoute] = createSignal<Route>({ type: "findings" })

    const navigate = (next: Route) => {
      const previous = route()
      if (previous.type === next.type) return

      if (next.type === "detail" && report.current() === null) {
        setRoute({ type: "findings" })
        return
      }

      if (previous.type === "findings" && next.type !== "findings") {
        report.clearCategoryFilter()
      }

      setRoute(next)
    }

    return {
      route,
      navigate,
      /** Back is always to the findings list — the only screen that is a starting point. */
      back: () => navigate({ type: "findings" }),
    }
  },
})
