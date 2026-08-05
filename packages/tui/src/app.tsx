/**
 * The app shell: enterprise provider stack, startup screen, route switch, masthead.
 */

import { type CliRendererConfig, createCliRenderer } from "@opentui/core"
import { render } from "@opentui/solid"
import { ErrorBoundary, Match, Show, Switch, createSignal } from "solid-js"
import type { ConformanceReport } from "@reasonsmith/core"
import { DialogProviderWithOverlay } from "./ui/dialog.tsx"
import { EnterpriseKeymapProvider } from "./context/enterprise-keymap.tsx"
import { ExitProvider } from "./context/exit.tsx"
import { KeybindProvider } from "./context/keybind.tsx"
import { KVProvider } from "./context/kv.tsx"
import { LayoutProvider } from "./context/layout.tsx"
import { ReportProvider } from "./context/report.tsx"
import { RouteProvider, useRoute } from "./context/route.tsx"
import { ThemeProvider, useTheme } from "./context/theme.tsx"
import { ToastProvider, ToastViewport, useToast } from "./context/toast.tsx"
import { Detail } from "./routes/detail.tsx"
import { Findings } from "./routes/findings.tsx"
import { Limits } from "./routes/limits.tsx"
import { Packs } from "./routes/packs.tsx"
import { Settings } from "./routes/settings.tsx"
import { Systems } from "./routes/systems.tsx"
import { FooterHints } from "./ui/footer-hints.tsx"
import { ReportHeader } from "./ui/header.tsx"
import { StartupScreen } from "./ui/startup-screen.tsx"
import { StatusBar } from "./ui/status-bar.tsx"
import { useKV } from "./context/kv.tsx"

function rendererConfig(): CliRendererConfig {
  const enterprise = process.env.REASONSMITH_TERMINAL === "1"
  return {
    targetFps: enterprise ? 60 : 45,
    gatherStats: enterprise,
    exitOnCtrlC: false,
    useMouse: true,
    enableMouseMovement: true,
    consoleMode: "disabled",
    useKittyKeyboard: {
      disambiguate: true,
      alternateKeys: true,
      events: false,
    },
  }
}

export async function tui(report: ConformanceReport): Promise<void> {
  const renderer = await createCliRenderer(rendererConfig())

  await render(
    () => (
      <ErrorBoundary
        fallback={(error) => {
          renderer.stop()
          process.stderr.write(
            `reasonsmith tui: ${
              error instanceof Error ? (error.stack ?? error.message) : String(error)
            }\n`,
          )
          return null
        }}
      >
        <KVProvider>
          <ThemeProvider>
            <ExitProvider>
              <ReportProvider report={report}>
                <RouteProvider>
                  <LayoutProvider>
                    <DialogProviderWithOverlay>
                      <EnterpriseKeymapProvider>
                        <ToastProvider>
                          <KeybindProvider>
                            <AppShell />
                          </KeybindProvider>
                        </ToastProvider>
                      </EnterpriseKeymapProvider>
                    </DialogProviderWithOverlay>
                  </LayoutProvider>
                </RouteProvider>
              </ReportProvider>
            </ExitProvider>
          </ThemeProvider>
        </KVProvider>
      </ErrorBoundary>
    ),
    renderer,
  )

  await new Promise<void>((resolve) => {
    const poll = setInterval(() => {
      if (!renderer.isRunning) {
        clearInterval(poll)
        resolve()
      }
    }, 50)
  })
}

function AppShell() {
  const kv = useKV()
  const toast = useToast()
  const [ready, setReady] = createSignal(!kv.showStartup() || process.env.REASONSMITH_SKIP_STARTUP === "1")

  return (
    <box flexDirection="column" width="100%" height="100%">
      <ReportHeader />
      <Show
        when={ready()}
        fallback={
          <box flexGrow={1} minHeight={0} width="100%">
            <StartupScreen
              onReady={() => {
                setReady(true)
                toast.show("Enterprise dashboard ready", "ok", 2200)
              }}
            />
          </box>
        }
      >
        <App />
      </Show>
      <Show when={ready()}>
        <ToastViewport />
      </Show>
    </box>
  )
}

function App() {
  const t = useTheme()
  const route = useRoute()

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} width="100%" backgroundColor={t.color.bg}>
      <StatusBar />
      <box flexGrow={1} minHeight={0} width="100%" paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={0}>
        <Switch>
          <Match when={route.route().type === "findings"}>
            <Findings />
          </Match>
          <Match when={route.route().type === "detail"}>
            <Detail />
          </Match>
          <Match when={route.route().type === "limits"}>
            <Limits />
          </Match>
          <Match when={route.route().type === "packs"}>
            <Packs />
          </Match>
          <Match when={route.route().type === "systems"}>
            <Systems />
          </Match>
          <Match when={route.route().type === "settings"}>
            <Settings />
          </Match>
        </Switch>
      </box>
      <box flexShrink={0} width="100%">
        <FooterHints />
      </box>
    </box>
  )
}
