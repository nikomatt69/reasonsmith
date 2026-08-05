/**
 * Enterprise TUI config — persisted user preferences (nikcli KV shape).
 */

import { readFileSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { PaletteId } from "../theme/palettes.ts"

export interface TuiConfig {
  readonly palette?: PaletteId
  readonly showStartup?: boolean
}

const DEFAULT_CONFIG: TuiConfig = {
  palette: "enterprise-dark",
  showStartup: true,
}

export function configPath(): string {
  const base = process.env.REASONSMITH_CONFIG_DIR ?? join(homedir(), ".config", "reasonsmith")
  return join(base, "tui.json")
}

export async function loadConfig(): Promise<TuiConfig> {
  try {
    const raw = await readFile(configPath(), "utf8")
    const parsed = JSON.parse(raw) as Partial<TuiConfig>
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function loadConfigSync(): TuiConfig {
  try {
    const raw = readFileSync(configPath(), "utf8")
    const parsed = JSON.parse(raw) as Partial<TuiConfig>
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(config: TuiConfig): Promise<void> {
  const path = configPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8")
}
