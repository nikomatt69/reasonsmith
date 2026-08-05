/**
 * `reasonsmith check` — run a system against a pack and print the report.
 *
 * What a reader must not break:
 *   - **The exit code contract: 2 when at least one requirement is VIOLATED, 1 on a usage or input
 *     error, 0 otherwise.** Automation relies on 2 to distinguish a breach from a clean run and from
 *     a syntax error. `exitCodeFor` is where the rule lives; nothing here may add a second one.
 *   - A run that reported a duty not applicable *only* because the system declared no decision
 *     domain prints the report's own notice to **stderr** as well as into the report, and still
 *     exits on the contract above. Stdout may be JSON or redirected to a file; a caller reading
 *     neither still learns that duties went unchecked. The exit code cannot distinguish a clean run
 *     from a run that looked at nothing, so a caller that only watches exit codes must be told some
 *     other way.
 *   - `--audience` changes *what the text rendering shows*, never what the run claims: one set of
 *     verdicts, one set of strengths, five artefacts. **`--json` is deliberately unprojected** — it
 *     is the complete machine record, and a consumer parsing it must not have fields disappear under
 *     a display flag.
 *   - The renderer is `renderText` from the core. A second renderer here would be a second idea of
 *     what a verdict looks like.
 */

import {
  AUDIENCES,
  type Audience,
  DECISION_DOMAINS,
  REGULATORY_CLASSES,
  listPacks,
  renderText,
} from "@reasonsmith/core"

import { cmd } from "./cmd.ts"
import { exitCodeFor, runCheck } from "../run.ts"
import { SHIPPED_SYSTEMS, SHIPPED_SYSTEM_NAMES, UsageError, resolveSystem } from "../system.ts"

const shippedSystemHelp = SHIPPED_SYSTEM_NAMES.map(
  (name) => `  ${name}\n      ${SHIPPED_SYSTEMS[name].describe}`,
).join("\n")

export const CheckCommand = cmd({
  command: "check",
  describe: "check a system's conformance against a regulation pack",
  builder: (yargs) =>
    yargs
      .option("pack", {
        alias: "p",
        type: "string",
        demandOption: true,
        describe: `pack to check against. Built-in packs: ${listPacks().join(", ")}`,
      })
      .option("system", {
        alias: "s",
        type: "string",
        describe:
          `one of the systems this package ships (${SHIPPED_SYSTEM_NAMES.join(", ")}), or a path ` +
          "to a JSONL decision log. A log has no decide(), no logic() and no artifact(), so " +
          "observed is its ceiling",
      })
      .option("capabilities", {
        type: "string",
        describe:
          "path to a capability declaration naming the signals the system can emit, one per line " +
          "(# starts a comment). With it, the report says the capabilities were declared by the " +
          "system's maintainers; without it they are derived from the supplied log and the report " +
          "says so. Only meaningful with a --system decision log",
      })
      .option("system-module", {
        type: "string",
        describe:
          "IMPORTS AND EXECUTES the named module and takes EXPORT from it as the system under " +
          "test, spelled <specifier>:<export> — the same module:attribute path gunicorn uses. " +
          "The export may be a system or a zero-argument factory returning one. A system loaded " +
          "this way can expose decide() and artifact(), so it reaches rungs a decision log " +
          "cannot. Mutually exclusive with --system",
      })
      .option("system-name", {
        type: "string",
        default: "SUT",
        describe: "name of the system under test, as the report prints it",
      })
      .option("system-scope", {
        type: "string",
        choices: [...REGULATORY_CLASSES],
        describe:
          "declared regulatory classification of the system. Requirements limited to another " +
          "class, or to any class when this is left undeclared, are reported not applicable " +
          "rather than assumed to apply",
      })
      .option("system-domain", {
        type: "string",
        array: true,
        choices: [...DECISION_DOMAINS],
        describe:
          "declared decision domain — the kind of decision this system makes. Repeat for a " +
          "system that makes more than one kind. Requirements about other domains, or about any " +
          "domain when this is left undeclared, are reported not applicable rather than assumed " +
          "to apply. This vocabulary is the pack author's, not any regulation's",
      })
      .option("requirement", {
        type: "string",
        array: true,
        describe:
          "run only the named requirement(s). The requirements are the shipped ones unmodified, " +
          "and the report's pack line says which subset was run",
      })
      .option("audience", {
        type: "string",
        choices: [...AUDIENCES],
        default: "auditor",
        describe:
          "project the text rendering for one reader. The run, the verdicts and the strengths " +
          "are the same whichever is given — only what is shown changes, and every audience " +
          "keeps the limits of the report. --json is unaffected: it is the complete machine " +
          "record, not a reader's artefact",
      })
      .option("json", {
        type: "boolean",
        default: false,
        describe:
          "print the complete machine record instead of the text rendering. Unprojected by " +
          "--audience on purpose: a pipeline must not lose fields to a display flag",
      })
      .epilogue(
        "worked examples, all shipped in this package:\n" +
          "\n" +
          "  the reason-deletion certificate — a credit system whose notice states one reason\n" +
          "  while its own inference used five. This run reports VIOLATED and names the reasons\n" +
          "  it deleted, measured by re-running that inference:\n" +
          "    reasonsmith check --pack ecoa --system truncating-credit\n" +
          "\n" +
          "  the same duty against two other surfaces, one rung apart:\n" +
          "    reasonsmith check --pack ecoa --system neural-scorer\n" +
          "    reasonsmith check --pack ecoa --system probabilistic-scorer\n" +
          "\n" +
          "  a system of your own, imported and executed:\n" +
          "    reasonsmith check --pack ecoa --system-module ./my-system.ts:systemUnderTest\n" +
          "\n" +
          "  what the person the decision was about is shown:\n" +
          "    reasonsmith check --pack ecoa --system truncating-credit \\\n" +
          "      --audience affected-individual\n" +
          "\n" +
          "shipped systems:\n" +
          shippedSystemHelp +
          "\n\n" +
          "exit codes:\n" +
          "  0  the run completed and no requirement was violated. Unattainable, not applicable\n" +
          "     and not evaluated findings do not change this: none of them is evidence the\n" +
          "     system failed a duty.\n" +
          "  1  a usage or input error.\n" +
          "  2  at least one requirement was VIOLATED.",
      ),
  handler: async (args) => {
    const { sut } = await resolveSystem({
      system: args.system as string | undefined,
      systemModule: args["system-module"] as string | undefined,
      capabilities: args.capabilities as string | undefined,
      systemName: args["system-name"] as string,
      systemDomains: (args["system-domain"] as string[] | undefined) ?? null,
    })

    const report = runCheck({
      pack: args.pack as string,
      sut,
      systemName: args["system-name"] as string,
      systemScope: (args["system-scope"] as string | undefined) ?? null,
      systemDomains: (args["system-domain"] as string[] | undefined) ?? null,
      requirements: (args.requirement as string[] | undefined) ?? [],
    })

    if (args.json) {
      process.stdout.write(`${JSON.stringify(report.toDict(), null, 2)}\n`)
    } else {
      process.stdout.write(`${renderText(report, args.audience as Audience)}\n`)
    }

    // Stdout may be JSON or redirected; the notice goes to stderr as well so a caller reading
    // neither still learns that duties went unchecked for a missing declaration.
    const notice = report.undeclaredDomainNotice
    if (notice !== null) process.stderr.write(`\n${notice}\n`)

    process.exitCode = exitCodeFor(report)
  },
})

export { UsageError }
