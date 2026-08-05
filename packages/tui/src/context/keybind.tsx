/**
 * The keybind context — @opentui/keymap enterprise command registry + findings navigation.
 */

import { createSignal, onMount } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
import {
  registerTimedLeader,
} from "@opentui/keymap/addons"
import { useBindings, useKeymap, reactiveMatcherFromSignal } from "@opentui/keymap/solid"
import { createSimpleContext } from "./helper.tsx"
import { useExit } from "./exit.tsx"
import { useReport } from "./report.tsx"
import { useRoute } from "./route.tsx"
import { useTheme } from "./theme.tsx"
import { useToast } from "./toast.tsx"
import { useDialog } from "../ui/dialog.tsx"
import { DialogCommandPalette } from "../ui/dialog-command-palette.tsx"
import { DialogHelp } from "../ui/dialog-help.tsx"
import { DialogSettings } from "../ui/dialog-settings.tsx"
import { DialogTheme } from "../ui/dialog-theme.tsx"
import { runCommand, type CommandContext } from "../ui/commands.ts"
import { Keybind } from "../util/keybind.ts"

export interface Binding {
  readonly keys: string
  readonly label: string
  readonly on: ReadonlyArray<"findings" | "detail" | "limits" | "packs" | "systems" | "settings">
  readonly leader?: boolean
}

export const BINDINGS: readonly Binding[] = [
  { keys: "ctrl+p", label: "commands", on: ["findings", "detail", "limits", "packs", "systems", "settings"] },
  { keys: "ctrl+,", label: "settings", on: ["findings", "detail", "limits", "packs", "systems", "settings"] },
  { keys: "j/k ↑↓", label: "move", on: ["findings"] },
  { keys: "g/G", label: "jump", on: ["findings"] },
  { keys: "enter", label: "open", on: ["findings"] },
  { keys: "esc", label: "back", on: ["detail", "limits", "packs", "systems", "settings"] },
  { keys: "a", label: "audience", on: ["findings", "detail", "limits", "packs", "systems", "settings"] },
  { keys: "L", label: "limits", on: ["findings", "detail", "packs", "systems", "settings"] },
  { keys: "p", label: "packs", on: ["findings"] },
  { keys: "s", label: "systems", on: ["findings"] },
  { keys: "t", label: "theme", on: ["findings", "detail", "limits", "packs", "systems", "settings"] },
  { keys: "h", label: "help", on: ["findings", "detail", "limits", "packs", "systems", "settings"], leader: true },
  { keys: "t", label: "theme", on: ["findings", "detail", "limits", "packs", "systems", "settings"], leader: true },
  { keys: "q", label: "quit", on: ["findings", "detail", "limits", "packs", "systems", "settings"] },
  { keys: "?", label: "help", on: ["findings", "detail", "limits", "packs", "systems", "settings"] },
]

const leaderRegistered = new WeakMap<object, boolean>()

export const { use: useKeybind, provider: KeybindProvider } = createSimpleContext({
  name: "Keybind",
  init: () => {
    const renderer = useRenderer()
    const keymap = useKeymap()
    const exit = useExit()
    const report = useReport()
    const route = useRoute()
    const theme = useTheme()
    const dialog = useDialog()
    const toast = useToast()
    const [leader, setLeader] = createSignal(false)

    const quit = () => void exit.exit()

    const openCommandPalette = () =>
      dialog.push(() => <DialogCommandPalette />, { size: "large" })
    const openHelp = () => dialog.push(() => <DialogHelp />, { size: "large" })
    const openTheme = () => dialog.push(() => <DialogTheme />)
    const openSettings = () => dialog.push(() => <DialogSettings />, { size: "large" })

    const commandContext = (): CommandContext => ({
      navigate: (type) => route.navigate({ type }),
      cycleAudience: () => {
        report.cycleAudience()
        toast.show(`Audience: ${report.audience()}`, "info")
      },
      setAudience: (audience) => {
        report.setAudience(audience)
        toast.show(`Audience: ${audience}`, "info")
      },
      cyclePalette: () => {
        theme.cyclePalette()
        toast.show(`Theme: ${theme.paletteId()}`, "ok")
      },
      setPalette: (id) => {
        theme.setPalette(id)
        toast.show(`Theme: ${id}`, "ok")
      },
      clearCategoryFilter: () => {
        report.clearCategoryFilter()
        toast.show("Filter cleared", "info")
      },
      openHelp,
      openTheme,
      openSettings,
      openCommandPalette,
      quit,
    })

    const dispatchCommand = (id: string) => {
      runCommand(id, commandContext())
    }

    onMount(() => {
      if (!leaderRegistered.get(keymap)) {
        registerTimedLeader(keymap, {
          trigger: "ctrl+x",
          name: "leader",
          timeoutMs: 2000,
          onArm: () => {
            const focused = renderer.currentFocusedRenderable
            focused?.blur?.()
            setLeader(true)
          },
          onDisarm: () => setLeader(false),
        })
        leaderRegistered.set(keymap, true)
      }
    })

    useBindings(() => ({
      priority: 50,
      enabled: reactiveMatcherFromSignal(() => !dialog.isOpen()),
      bindings: [
        { key: "ctrl+p", cmd: "command.palette" },
        { key: "ctrl+,", cmd: "settings.open" },
        { key: "q", cmd: "app.quit" },
        { key: "ctrl+c", cmd: "app.quit" },
        { key: "?", cmd: "help.open" },
        { key: "t", cmd: "theme.cycle" },
        { key: "a", cmd: "audience.cycle" },
        { key: "shift+l", cmd: "route.limits" },
        { key: "p", cmd: "route.packs" },
        { key: "s", cmd: "route.systems" },
        { key: "escape", cmd: "route.back" },
        { key: "<leader>h", cmd: "help.open" },
        { key: "<leader>t", cmd: "theme.picker" },
        { key: "<leader>a", cmd: "audience.cycle" },
        { key: "<leader>l", cmd: "route.limits" },
        { key: "<leader>p", cmd: "route.packs" },
        { key: "<leader>s", cmd: "route.systems" },
        { key: "<leader>e", cmd: "route.settings" },
        { key: "<leader>q", cmd: "app.quit" },
      ],
      commands: [
        { name: "command.palette", desc: "Open command palette", run: () => { openCommandPalette(); return true } },
        { name: "settings.open", desc: "Open settings panel", run: () => { openSettings(); return true } },
        { name: "help.open", desc: "Open help", run: () => { openHelp(); return true } },
        { name: "theme.picker", desc: "Open theme picker", run: () => { openTheme(); return true } },
        { name: "theme.cycle", desc: "Cycle theme", run: () => { dispatchCommand("theme-cycle"); return true } },
        { name: "audience.cycle", desc: "Cycle audience", run: () => { dispatchCommand("audience-cycle"); return true } },
        { name: "route.limits", desc: "Go to limits", run: () => { route.navigate({ type: "limits" }); return true } },
        { name: "route.packs", desc: "Go to packs", run: () => { route.navigate({ type: "packs" }); return true } },
        { name: "route.systems", desc: "Go to systems", run: () => { route.navigate({ type: "systems" }); return true } },
        { name: "route.settings", desc: "Go to settings", run: () => { route.navigate({ type: "settings" }); return true } },
        {
          name: "route.back",
          desc: "Go back",
          run: () => {
            if (leader()) {
              setLeader(false)
              return true
            }
            route.back()
            return true
          },
        },
        { name: "app.quit", desc: "Quit", run: () => { quit(); return true } },
      ],
    }))

    useKeyboard((event) => {
      if (Keybind.isRepeat(event)) return
      if (dialog.isOpen()) return
      if (route.route().type !== "findings") return

      switch (event.name) {
        case "j":
        case "down":
          report.next()
          return
        case "k":
        case "up":
          report.previous()
          return
        case "g":
          if (event.shift) report.last()
          else report.first()
          return
        case "home":
          report.first()
          return
        case "end":
          report.last()
          return
        case "return":
        case "enter":
          if (report.current()) route.navigate({ type: "detail" })
          return
      }
    })

    function click(action: string): void {
      switch (action) {
        case "commands":
          openCommandPalette()
          return
        case "settings":
          openSettings()
          return
        case "quit":
          quit()
          return
        case "help":
          openHelp()
          return
        case "theme":
          openTheme()
          return
        case "back":
          route.back()
          return
        case "audience":
          report.cycleAudience()
          return
        case "limits":
          route.navigate({ type: "limits" })
          return
        case "packs":
          route.navigate({ type: "packs" })
          return
        case "systems":
          route.navigate({ type: "systems" })
          return
        case "open":
          route.navigate({ type: "detail" })
          return
        case "move":
          report.next()
          return
        case "jump":
          report.first()
          return
      }
    }

    return {
      bindings: BINDINGS,
      leader,
      keymap,
      printFor(action: string): string {
        const match = BINDINGS.find((b) => b.label === action)
        if (!match) return ""
        if (match.leader) return `ctrl+x ${match.keys.split(" ")[0] ?? match.keys}`
        return match.keys
      },
      formatKey(key: string): string {
        try {
          return keymap.formatKey(key)
        } catch {
          return key
        }
      },
      quit,
      click,
      openCommandPalette,
      openHelp,
      openTheme,
      openSettings,
      dispatchCommand,
    }
  },
})
