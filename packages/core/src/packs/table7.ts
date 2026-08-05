/**
 * The Table 7 pack, transcribed from `src/reasonsmith/packs/table7.toml`.
 *
 * PLACEHOLDER: requirement bodies here are minimal — one row per duty, with the
 * `verbatim_text` carried as the statutory quotation but the `spec` reduced to a
 * trivial presence check. The full port (every row, every signal) is pending.
 * The fields are kept verbatim on purpose so a quote checked against the print
 * is the only thing keeping the pack attached to the paper it names.
 */
import type { RequirementInit } from "../spec.ts"

const requirements: RequirementInit[] = [
  {
    id: "eu_ai_act_art13_transparency",
    source_document: "EU AI Act",
    article_clause: "Art. 13",
    verbatim_text: "Transparency and information to deployers",
    stakeholder: "deployer",
    formalism: "record",
    spec: "present(model_and_data_version_ids)",
    rationale: "Placeholder for the Table 7 row; the full spec is pending the port.",
    requires: ["model_and_data_version_ids"],
    binding: true,
    scope: "high-risk",
    domains: [],
    deontic_type: "obligation",
    defeasibility: "strict",
  },
  {
    id: "table7_placeholder",
    source_document: "Table 7 (Stan, Sciavicco & Napoletano, JAIR 2026)",
    article_clause: "p. 36:22",
    verbatim_text: "Checklist that ties symbolic artifacts to legal/assurance duties and the associated logging.",
    stakeholder: "regulator",
    formalism: "record",
    spec: "present(artifact_logs_event_log)",
    rationale: "Placeholder for the remaining Table 7 rows; the full port is pending.",
    requires: ["artifact_logs_event_log"],
    binding: true,
    scope: "",
    domains: [],
    deontic_type: "obligation",
    defeasibility: "strict",
  },
]

/** Table 7 of Stan, Sciavicco & Napoletano (JAIR 2026), as a placeholder pack. */
export function table7Pack() {
  return {
    id: "table7",
    title: "Table 7: Symbolic XAI Regulatory & Governance Duties",
    description:
      "Placeholder port of Table 7. The full requirement body is pending the upstream port.",
    source_metadata: {
      table: "Table 7",
      paper: "Symbols and Neurons: A Review of Symbolic XAI in Deep Learning",
      authors: "Stan, Sciavicco & Napoletano",
      venue: "Journal of Artificial Intelligence Research, Vol. 86, Article 36",
      publication_date: "July 2026",
      page: "36:22",
      section: "5.3 Alignment with Regulatory and Governance Requirements",
    },
    requirements,
  }
}
