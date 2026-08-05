/**
 * The settings route — settings body in a scrollable route panel.
 */

import { SettingsBody } from "./settings-body.tsx"
import { RoutePanel } from "../ui/route-panel.tsx"

export function Settings() {
  return (
    <RoutePanel title="Settings">
      <SettingsBody />
    </RoutePanel>
  )
}
