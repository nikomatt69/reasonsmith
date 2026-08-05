/**
 * Enterprise startup screen — brief branded load with spinner.
 */

import { createSignal, onMount } from "solid-js"
import { useTheme } from "../context/theme.tsx"
import { Spinner } from "./spinner.tsx"

export function StartupScreen(props: { onReady: () => void; minMs?: number }) {
  const t = useTheme()
  const [frame, setFrame] = createSignal(0)
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

  onMount(() => {
    const min = props.minMs ?? 450
    const start = Date.now()
    const finish = () => {
      const wait = Math.max(0, min - (Date.now() - start))
      setTimeout(props.onReady, wait)
    }
    finish()
  })

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={t.color.bg} alignItems="center" justifyContent="center" gap={1}>
      <Spinner onFrame={(index) => setFrame(index)} />
      <text fg={t.color.info} attributes={t.attr.bold} wrapMode="none" content="REASONSMITH ENTERPRISE" />
      <text fg={t.color.textMuted} attributes={t.attr.dim} wrapMode="none">
        {`loading OpenTUI dashboard ${frames[frame()] ?? ""}`}
      </text>
    </box>
  )
}
