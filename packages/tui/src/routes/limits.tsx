/**
 * The limits route: what this report does not claim.
 */

import { SyntaxStyle } from "@opentui/core"
import { useReport } from "../context/report.tsx"
import { useTheme } from "../context/theme.tsx"
import { RoutePanel } from "../ui/route-panel.tsx"

const SYNTAX_STYLE = SyntaxStyle.create()

const CANNOT_MARKDOWN = [
  "## 1. It takes the system's word about what it is",
  "",
  "Read a satisfied row as “the record has the fields”, never as “the system computes what it says it computes”.",
  "",
  "## 2. Depth is uneven, and here is the shape of it",
  "",
  "Three quarters of the shipped duties are presence checks, and presence is not adequacy: a reason field that is filled in is not a reason that is sufficient.",
  "",
  "## 3. A rung is not a grade",
  "",
  "The lattice ranks how a conclusion was reached and not what it was reached about, so a report full of proved verdicts is not a better report than one full of observed verdicts.",
  "",
  "## 4. The strongest results need a system that exposes its inference, and most do not",
  "",
  "A system that is only a decision log reaches observed and no further, whatever the pack asks — and most audited systems are only a decision log.",
].join("\n")

const STANDING_MARKDOWN =
  "And the standing one, on every report this tool prints: nothing here determines whether a legal " +
  "duty is discharged. It reports what a formal specification asks and how the verdict was reached."

export function Limits() {
  const t = useTheme()
  const report = useReport()

  return (
    <RoutePanel title="Limits of this report">
      <text
        fg={t.color.text}
        attributes={t.attr.bold}
        wrapMode="none"
        content="LIMITS OF THIS REPORT"
      />
      <markdown
        content={report.report.limits}
        syntaxStyle={SYNTAX_STYLE}
        fg={t.color.textSecondary}
        bg={t.color.bg}
      />

      <text
        fg={t.color.text}
        attributes={t.attr.bold}
        wrapMode="none"
        content="WHAT THIS TOOL DOES NOT DO"
      />
      <text
        fg={t.color.textMuted}
        attributes={t.attr.dim}
        wrapMode="none"
        content="quoted from docs/what-this-does-not-do.md"
      />
      <markdown
        content={CANNOT_MARKDOWN}
        syntaxStyle={SYNTAX_STYLE}
        fg={t.color.textSecondary}
        bg={t.color.bg}
      />

      <markdown
        content={STANDING_MARKDOWN}
        syntaxStyle={SYNTAX_STYLE}
        fg={t.color.textMuted}
        bg={t.color.bg}
      />
    </RoutePanel>
  )
}
