/**
 * The packs route: a `<select>` picker over every built-in conformance pack.
 */

import { listPacks, loadPack } from "@reasonsmith/core"
import { useTheme } from "../context/theme.tsx"
import { useToast } from "../context/toast.tsx"
import { RoutePanel } from "../ui/route-panel.tsx"

export function Packs() {
  const t = useTheme()
  const toast = useToast()

  const options = () =>
    listPacks().map((packId) => {
      const pack = loadPack(packId)
      return {
        name: packId,
        value: packId,
        description: pack.description,
      }
    })

  return (
    <RoutePanel title="Conformance packs" scroll={false} padded={false}>
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
            loadPack(String(option.value))
            toast.show(`Pack selected: ${option.value} — restart CLI to reload run`, "warn")
          }
        }}
      />
    </RoutePanel>
  )
}
