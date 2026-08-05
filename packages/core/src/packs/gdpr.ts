/**
 * The GDPR pack (Regulation (EU) 2016/679), Article 22 & Recital 71, transcribed
 * from `src/reasonsmith/packs/gdpr.toml`.
 *
 * PLACEHOLDER: requirement bodies here are minimal — one row per duty, with the
 * `verbatim_text` carried as the statutory quotation but the `spec` reduced to a
 * trivial presence check. The full port (every row, every signal) is pending.
 * The fields are kept verbatim on purpose so a quote checked against the print
 * (and against `docs/legal-sources.md`) is the only thing keeping the pack
 * attached to the law it names.
 */
import type { RequirementInit } from "../spec.ts"

const requirements: RequirementInit[] = [
  {
    id: "gdpr_art22_1_automated_decision_prohibition",
    source_document: "GDPR (Regulation (EU) 2016/679)",
    article_clause: "Article 22(1)",
    verbatim_text:
      "The data subject shall have the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects concerning him or her or similarly significantly affects him or her.",
    stakeholder: "affected individual",
    formalism: "record",
    spec: "present(artifact_logs_decision_record)",
    rationale: "Placeholder for the GDPR Article 22(1) row; the full signal-fan spec is pending the port.",
    requires: ["artifact_logs_decision_record"],
    binding: true,
    scope: "",
    domains: [],
    deontic_type: "prohibition",
    defeasibility: "defeasible-unmodelled",
  },
  {
    id: "gdpr_placeholder",
    source_document: "GDPR (Regulation (EU) 2016/679)",
    article_clause: "Recital 71",
    verbatim_text:
      "In any case, such processing should be subject to suitable safeguards, which should include specific information to the data subject and the right to obtain human intervention, to express his or her point of view, to obtain an explanation of the decision reached after such assessment and to challenge the decision.",
    stakeholder: "affected individual",
    formalism: "record",
    spec: "present(artifact_logs_reason_explanation)",
    rationale: "Placeholder for the remaining GDPR Article 22 / Recital 71 rows; the full port is pending.",
    requires: ["artifact_logs_reason_explanation"],
    binding: true,
    scope: "",
    domains: [],
    deontic_type: "obligation",
    defeasibility: "trigger-unmodelled",
  },
]

/** The GDPR (Article 22 & Recital 71) pack. */
export function gdprPack() {
  return {
    id: "gdpr",
    title: "GDPR (Regulation (EU) 2016/679): Article 22 & Recital 71",
    description:
      "Placeholder port of the GDPR Article 22 / Recital 71 requirements. The full requirement body is pending the upstream port.",
    source_metadata: {
      document: "Regulation (EU) 2016/679 of the European Parliament and of the Council (GDPR)",
      publication: "Official Journal of the European Union, OJ L 119, 4.5.2016, p. 1–88",
      url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679",
    },
    requirements,
  }
}
