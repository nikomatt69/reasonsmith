/**
 * The EU AI Act pack (Regulation (EU) 2024/1689), Articles 12 & 13, transcribed
 * from `src/reasonsmith/packs/eu_ai_act.toml`.
 *
 * PLACEHOLDER: requirement bodies here are minimal — one row per duty, with the
 * `verbatim_text` carried as the statutory quotation but the `spec` reduced to a
 * trivial presence check. The full port (every row, every signal) is pending.
 * The fields are kept verbatim on purpose so a quote checked against the print
 * (and against `docs/legal-sources.md`) is the only thing keeping the pack
 * attached to the law it names.
 *
 * This is the *high-risk* Article 12/13 pack. The general-purpose Article 53/55
 * pack lives in `gpai.ts` and is registered under the same `eu-ai-act` namespace
 * upstream; here it is a separate `gpai` pack for now.
 */
import type { RequirementInit } from "../spec.ts"

const requirements: RequirementInit[] = [
  {
    id: "eu_ai_act_art12_1_automatic_logging",
    source_document: "EU AI Act (Regulation (EU) 2024/1689)",
    article_clause: "Article 12(1)",
    verbatim_text:
      "High-risk AI systems shall technically allow for the automatic recording of events (logs) over the lifetime of the system.",
    stakeholder: "regulator",
    formalism: "record",
    spec: "present(artifact_logs_event_log)",
    rationale:
      "Placeholder for the EU AI Act Article 12(1) row; the full signal-fan spec is pending the port.",
    requires: ["artifact_logs_event_log"],
    binding: true,
    scope: "high-risk",
    domains: [],
    deontic_type: "obligation",
    defeasibility: "strict",
  },
  {
    id: "eu_ai_act_placeholder",
    source_document: "EU AI Act (Regulation (EU) 2024/1689)",
    article_clause: "Article 13",
    verbatim_text:
      "High-risk AI systems shall be designed and developed in such a way as to ensure that their operation is sufficiently transparent to enable deployers to interpret a system's output and use it appropriately.",
    stakeholder: "deployer",
    formalism: "record",
    spec: "present(artifact_logs_reason_explanation)",
    rationale: "Placeholder for the remaining EU AI Act Article 13 rows; the full port is pending.",
    requires: ["artifact_logs_reason_explanation"],
    binding: true,
    scope: "high-risk",
    domains: [],
    deontic_type: "obligation",
    defeasibility: "strict",
  },
]

/** The EU AI Act (Articles 12 & 13) pack, high-risk class. */
export function euAiActPack() {
  return {
    id: "eu-ai-act",
    title: "EU AI Act (Regulation (EU) 2024/1689): Articles 12 & 13",
    description:
      "Placeholder port of the EU AI Act high-risk articles. The full requirement body is pending the upstream port.",
    source_metadata: {
      document: "Regulation (EU) 2024/1689 of the European Parliament and of the Council",
      publication: "Official Journal of the European Union, OJ L, 2024/1689, 12.7.2024",
      url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689",
    },
    requirements,
  }
}
