/**
 * The systems route: a `<select>` picker over every shipped demonstration system.
 */

import { listSystems } from "@reasonsmith/systems"
import { useTheme } from "../context/theme.tsx"
import { useToast } from "../context/toast.tsx"
import { RoutePanel } from "../ui/route-panel.tsx"

export function Systems() {
  const t = useTheme()
  const toast = useToast()

  const options = () =>
    listSystems().map((entry) => ({
      name: entry.name,
      value: entry.id,
      description: entry.description,
    }))

  return (
    <RoutePanel title="Systems under test" scroll={false} padded={false}>
      <select
        options={options()}
        flexGrow={1}
        minHeight={0}
        width="100%"
        backgroundColor={t.color.surface}
        textColor={t.color.text}
        focusedBackgroundColor={t.color.surfaceRaised}
        focusedTextColor={t.color.text}
        selectedBackgroundColor={t.color.surfaceRaised}
        selectedTextColor={t.color.text}
        descriptionColor={t.color.textSecondary}
        selectedDescriptionColor={t.color.text}
        showScrollIndicator
        showDescription
        showSelectionIndicator
        onSelect={(_index, option) => {
          if (option?.value !== undefined) {
            toast.show(`System selected: ${option.value} — restart CLI to reload run`, "warn")
          }
        }}
      />
    </RoutePanel>
  )
}
