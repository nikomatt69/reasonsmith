/**
 * Layout context — terminal dimensions and responsive breakpoints.
 *
 * Subscribes to OpenTUI resize events via `useTerminalDimensions` so every chrome
 * surface shares one source of truth for cols/rows and derived wrap widths.
 */

import { useTerminalDimensions } from "@opentui/solid"
import { createMemo } from "solid-js"
import { createSimpleContext } from "./helper.tsx"

export type LayoutBreakpoint = "xs" | "sm" | "md" | "lg"

function breakpoint(width: number): LayoutBreakpoint {
  if (width < 72) return "xs"
  if (width < 88) return "sm"
  if (width < 104) return "md"
  return "lg"
}

export const { use: useLayout, provider: LayoutProvider } = createSimpleContext({
  name: "Layout",
  init: () => {
    const dims = useTerminalDimensions()

    const width = () => dims().width
    const height = () => dims().height
    const bp = createMemo(() => breakpoint(width()))

    const compact = () => bp() === "xs" || bp() === "sm"
    const narrow = () => width() < 100

    /** Usable content width after shell padding (2 cols each side). */
    const contentWidth = () => Math.max(32, width() - 4)

    /** Prose wrap width for `wrap()` — panel padding + label gutter. */
    const wrapWidth = () => Math.max(32, contentWidth() - 2)

    const dialogWidth = (size: "small" | "medium" | "large" | "full"): number | "100%" => {
      if (size === "full") return "100%"
      const w = width()
      const caps = { small: 40, medium: 64, large: 80 } as const
      const cap = caps[size]
      return Math.max(28, Math.min(cap, w - 4))
    }

    const modalWidth = () => Math.max(36, Math.min(64, width() - 6))

    const maxFooterHints = () => {
      if (bp() === "xs") return 3
      if (bp() === "sm") return 4
      if (bp() === "md") return 6
      return 12
    }

    const showAsciiBrand = () => width() >= 88
    const showStatusLadder = () => width() >= 96
    const showHeaderMeta = () => width() >= 72

    return {
      width,
      height,
      breakpoint: bp,
      compact,
      narrow,
      contentWidth,
      wrapWidth,
      dialogWidth,
      modalWidth,
      maxFooterHints,
      showAsciiBrand,
      showStatusLadder,
      showHeaderMeta,
    }
  },
})
