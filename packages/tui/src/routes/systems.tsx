/**
 * The systems route: a `<select>` picker over every shipped demonstration system.
 *
 * Each option is `{ name, value, description }`, where `name` is the system's own
 * `SystemUnderTest.name` — so the picker agrees with the report header that already shows
 * `report.system_name` and with the `--system` id the CLI accepts. The options come from the new
 * `listSystems()` helper in `@reasonsmith/systems`, which returns one row per exported system.
 *
 * What a reader must not break:
 *
 *   - **The header is `Systems under test`.** It is the section this screen is the picker for, not
 *     a place to advertise the report this run already produced. The currently-loaded system is
 *     shown in the findings header and is not repeated here.
 *   - **The panel is dialog-styled.** Every panel in this TUI is a rounded-border box over the
 *     surface colour, matching the packs route beside it.
 *   - **`onSelect` is wired even though no route reloads the run.** The conformance run happens
 *     once before the renderer mounts (`index.tsx`); the callback is plumbed for parity with the
 *     packs route, and a future reload would reuse the same `<select>` shape.
 */

import { listSystems } from "@reasonsmith/systems"
import { useTheme } from "../context/theme.tsx"
import { useToast } from "../context/toast.tsx"

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
    <box flexDirection="column" flexGrow={1} minHeight={0} width="100%">
      <box
        flexDirection="column"
        flexGrow={1}
        minHeight={0}
        width="100%"
        borderStyle="rounded"
        borderColor={t.color.border}
        backgroundColor={t.color.surface}
        paddingLeft={1}
        paddingRight={1}
        title="Systems under test"
        titleAlignment="left"
      >
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
      </box>
    </box>
  )
}