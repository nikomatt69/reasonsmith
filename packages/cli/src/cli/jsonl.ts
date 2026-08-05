/**
 * A decision log on disk, as a system.
 *
 * The weakest surface there is: a trace and nothing else. No `decide()`, so no replay; no `logic()`,
 * so nothing to reason over; no `artifact()`, so the reason-adequacy duty is reported unattainable
 * rather than answered from the log. `observed` is the ceiling, and that is a fact about what a log
 * *is*, not a gap in this adapter.
 *
 * What a reader must not break:
 *   - **`--capabilities <file>` is the only way a CLI run says the system itself claims the signal
 *     names.** Without it the capability set is derived from this one sample trace and
 *     `capabilityBasis` is `"trace"`, which words the unattainable finding as a statement about the
 *     log; with it — even an empty or comment-only file, which declares nothing — the basis is
 *     `"declared"` and the finding speaks about the system as built. The two are distinct claims and
 *     neither may read as the other.
 *   - A malformed line is refused naming the file and the line number, never skipped. A log the tool
 *     silently read half of would produce a verdict over a trace nobody chose.
 */

import { readFileSync } from "node:fs"

import type { DecisionRecord, SystemUnderTest } from "@reasonsmith/core"

import { UsageError } from "./system.ts"

/** Parse a JSONL decision log, refusing a shape that would mislead. */
export function readJSONL(path: string): readonly DecisionRecord[] {
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch (error) {
    throw new UsageError(
      `--system ${path}: could not be read: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const records: DecisionRecord[] = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch (error) {
      throw new UsageError(
        `--system ${path}: decision on line ${i + 1} is not valid JSON: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new UsageError(
        `--system ${path}: decision on line ${i + 1} must be a JSON object, got ` +
          `${parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed}`,
      )
    }
    records.push(parsed as DecisionRecord)
  }
  if (records.length === 0) {
    throw new UsageError(`--system ${path}: no decision records found (the file held no JSON lines)`)
  }
  return records
}

/**
 * Read a capability declaration: one signal name per line, `#` starts a comment.
 *
 * A line carrying a comma or interior whitespace is refused rather than guessed at — several names
 * written on one line, or two names a space silently merged, are the two ways this file goes wrong,
 * and both would quietly change what the run reports unattainable.
 */
export function readCapabilitiesFile(path: string): readonly string[] {
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch (error) {
    throw new UsageError(
      `--capabilities ${path}: could not be read: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const names: string[] = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue
    if (trimmed.includes(",") || /\s/.test(trimmed)) {
      throw new UsageError(
        `--capabilities ${path}: line ${i + 1} holds ${JSON.stringify(trimmed)}, which is not one ` +
          "signal name. Write one name per line; a comma or a space would silently merge two names " +
          "into one that no system emits.",
      )
    }
    names.push(trimmed)
  }
  return [...new Set(names)].sort()
}

/** A decision log as a system under test. */
export class JSONLSystem implements SystemUnderTest {
  readonly name: string
  readonly capabilityBasis: "declared" | "trace"
  readonly systemDomains: readonly string[]
  private readonly records: readonly DecisionRecord[]
  private readonly declared: readonly string[] | null

  constructor(
    name: string,
    records: readonly DecisionRecord[],
    declared: readonly string[] | null,
    systemDomains: readonly string[] = [],
  ) {
    this.name = name
    this.records = records
    this.declared = declared
    this.capabilityBasis = declared === null ? "trace" : "declared"
    this.systemDomains = systemDomains
  }

  capabilities(): readonly string[] {
    if (this.declared !== null) return [...this.declared]
    return [...new Set(this.records.flatMap((rec) => Object.keys(rec)))].sort()
  }

  decisions(): readonly DecisionRecord[] {
    return this.records.map((rec) => ({ ...rec }))
  }

  /** A decision log holds what a system decided, not how. There is no formula here. */
  logic(): null {
    return null
  }
}
