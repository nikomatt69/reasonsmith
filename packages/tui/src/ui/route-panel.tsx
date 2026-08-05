/**
 * RoutePanel — shared scrollable route frame with responsive title bar.
 */

import type { ParentProps } from "solid-js"
import { Show } from "solid-js"
import { useLayout } from "../context/layout.tsx"
import { useTheme } from "../context/theme.tsx"

export interface RoutePanelProps extends ParentProps {
  readonly title: string
  readonly subtitle?: string
  readonly scroll?: boolean
  readonly padded?: boolean
}

export function RoutePanel(props: RoutePanelProps) {
  const t = useTheme()
  const layout = useLayout()
  const scroll = () => props.scroll !== false
  const padded = () => props.padded !== false

  const body = (
    <box flexDirection="column" flexGrow={1} minHeight={0} width="100%">
      {props.children}
    </box>
  )

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      width="100%"
      borderStyle="rounded"
      borderColor={t.color.border}
      backgroundColor={t.color.surface}
      paddingLeft={padded() ? 1 : 0}
      paddingRight={padded() ? 1 : 0}
      title={props.title}
      titleAlignment="left"
    >
      <Show when={props.subtitle && layout.showHeaderMeta()}>
        <text
          fg={t.color.textMuted}
          attributes={t.attr.dim}
          wrapMode="none"
          flexShrink={0}
          content={props.subtitle ?? ""}
        />
      </Show>
      <Show
        when={scroll()}
        fallback={body}
      >
        <scrollbox
          flexGrow={1}
          minHeight={0}
          width="100%"
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
          {body}
        </scrollbox>
      </Show>
    </box>
  )
}
