/**
 * The ECOA / Regulation B pack, transcribed from `src/reasonsmith/packs/ecoa.toml`. Fields are kept
 * verbatim (the `verbatim_text` is the statutory quotation; `spec` is the property in the one
 * language). A regression test pins the packs against the Python table where relevant; the fields
 * here carry the same meaning the TOML does.
 */
import type { RequirementInit } from "../spec.ts"

const requirements: RequirementInit[] = [
  {
    id: "ecoa_reg_b_1002_9_a_1_timing_of_notice",
    source_document: "ECOA / Regulation B (12 CFR 1002.9)",
    article_clause: "12 CFR 1002.9(a)(1)",
    verbatim_text:
      "A creditor shall notify an applicant of action taken within: (i) 30 days after receiving a " +
      "completed application concerning the creditor's approval of, counteroffer to, or adverse " +
      "action on the application; (ii) 30 days after taking adverse action on an incomplete " +
      "application, unless notice is provided in accordance with paragraph (c) of this section; " +
      "(iii) 30 days after taking adverse action on an existing account; or (iv) 90 days after " +
      "notifying the applicant of a counteroffer if the applicant does not expressly accept or use " +
      "the credit offered.",
    stakeholder: "affected individual",
    formalism: "temporal",
    spec:
      "always(present(artifact_logs_decision_record) -> " +
      "((artifact_logs_notification_latency_days <= 30) or " +
      "((artifact_logs_counteroffer_not_accepted >= 0.5) and " +
      "(artifact_logs_notification_latency_days <= 90))))",
    rationale:
      "Every decision the log records was notified within the deadline its own paragraph sets: 30 " +
      "days under (i)-(iii), or 90 days where the record says the applicant did not accept a " +
      "counteroffer, which is the only case (iv) reaches. Both numbers are the clause's own; " +
      "neither is this pack's.",
    requires: [
      "artifact_logs_decision_record",
      "artifact_logs_notification_latency_days",
      "artifact_logs_counteroffer_not_accepted",
    ],
    binding: true,
    scope: "",
    domains: ["consumer-credit"],
    deontic_type: "obligation",
    defeasibility: "defeasible-unmodelled",
  },
  {
    id: "ecoa_reg_b_1002_9_a_2_written_statement",
    source_document: "ECOA / Regulation B (12 CFR 1002.9)",
    article_clause: "12 CFR 1002.9(a)(2)",
    verbatim_text:
      "A notification given to an applicant when adverse action is taken shall be in writing and " +
      "shall contain a statement of the action taken; the name and address of the creditor; a " +
      "statement of the provisions of section 701(a) of the Act; the name and address of the " +
      "Federal agency that administers compliance with respect to the creditor; and either: (i) A " +
      "statement of specific reasons for the action taken; or (ii) A disclosure of the applicant's " +
      "right to a statement of specific reasons within 30 days, if the statement is requested " +
      "within 60 days of the creditor's notification.",
    stakeholder: "affected individual",
    formalism: "temporal",
    spec:
      "always(present(artifact_logs_decision_record) and present(provenance_model_version) and " +
      "(present(artifact_logs_reason_explanation) or present(artifact_logs_right_to_reasons_disclosure)))",
    rationale:
      "Every decision the log records carries the decision record and the model version that " +
      "produced it, together with one of the two contents the clause accepts: a statement of " +
      "specific reasons under point (i), or a disclosure of the applicant's right to request one " +
      "under point (ii). The disjunction is the clause's own `either`, so a creditor that lawfully " +
      "took one branch is not held to the other.",
    requires: ["artifact_logs_decision_record", "provenance_model_version"],
    binding: true,
    scope: "",
    domains: ["consumer-credit"],
    deontic_type: "obligation",
    defeasibility: "trigger-unmodelled",
  },
  {
    id: "ecoa_reg_b_1002_9_b_2_specific_reasons",
    source_document: "ECOA / Regulation B (12 CFR 1002.9)",
    article_clause: "12 CFR 1002.9(b)(2)",
    verbatim_text:
      "The statement of reasons for adverse action required by paragraph (a)(2)(i) of this " +
      "section must be specific and indicate the principal reason(s) for the adverse action. " +
      "Statements that the adverse action was based on the creditor's internal standards or " +
      "policies or that the applicant, joint applicant, or similar party failed to achieve a " +
      "qualifying score on the creditor's credit scoring system are insufficient.",
    stakeholder: "affected individual",
    formalism: "logical",
    spec:
      "present(artifact_logs_reason_explanation) -> (present(provenance_model_version) and " +
      "present(scope_statements_local_vs_global) and " +
      'not contains(artifact_logs_reason_explanation, "internal standards") and ' +
      'not contains(artifact_logs_reason_explanation, "internal policies") and ' +
      'not contains(artifact_logs_reason_explanation, "failed to achieve a qualifying score"))',
    rationale:
      "Where a decision carries a statement of reasons — which is when this clause bites, because " +
      "by its own words it governs the statement paragraph (a)(2)(i) requires — that statement " +
      "names the model version and the scope it speaks for, and is not one of the two the clause " +
      "itself calls insufficient. Nothing here decides whether any other statement is specific.",
    requires: [
      "artifact_logs_reason_explanation",
      "provenance_model_version",
      "scope_statements_local_vs_global",
    ],
    binding: true,
    scope: "",
    domains: ["consumer-credit"],
    deontic_type: "prohibition",
    defeasibility: "trigger-unmodelled",
  },
  {
    id: "ecoa_reg_b_1002_9_b_2_principal_reasons_complete",
    source_document: "ECOA / Regulation B (12 CFR 1002.9)",
    article_clause: "12 CFR 1002.9(b)(2)",
    verbatim_text:
      "The statement of reasons for adverse action required by paragraph (a)(2)(i) of this " +
      "section must be specific and indicate the principal reason(s) for the adverse action.",
    stakeholder: "affected individual",
    formalism: "logical",
    spec:
      "present(artifact_logs_reason_explanation) -> (artifact_logs_deleted_reason_count <= 0)",
    rationale:
      "Where a decision carries a statement of reasons, no reason the decision's own inference had " +
      "is missing from it. The count is measured, never read from the log: reasonsmith enumerates " +
      "the decision's reasons exactly from the inference artefact the system exposes and switches " +
      "each one off in turn, and counts the reasons the system's own answer turns out not to depend " +
      "on. The threshold is zero and is not this pack's invention: the clause requires the " +
      "principal reason(s), plural.",
    requires: ["artifact_logs_reason_explanation", "artifact_logs_deleted_reason_count"],
    binding: true,
    scope: "",
    domains: ["consumer-credit"],
    deontic_type: "obligation",
    defeasibility: "trigger-unmodelled",
  },
  {
    id: "ecoa_reg_b_1002_9_c_2_incompleteness_notice_runs_out",
    source_document: "ECOA / Regulation B (12 CFR 1002.9)",
    article_clause: "12 CFR 1002.9(c)(2)",
    verbatim_text:
      "The creditor shall have no further obligation under this section if the applicant fails to " +
      "respond within the designated time period. If the applicant supplies the requested " +
      "information within the designated time period, the creditor shall take action on the " +
      "application and notify the applicant in accordance with paragraph (a) of this section.",
    stakeholder: "affected individual",
    formalism: "temporal",
    spec:
      "always(present(artifact_logs_incompleteness_notice_sent) -> " +
      "until(present(artifact_logs_incompleteness_notice_sent), " +
      "present(artifact_logs_action_taken_notification) or " +
      "present(artifact_logs_response_period_lapsed)))",
    rationale:
      "Where the log records that a notice of incompleteness was sent, that notice stands as the " +
      "creditor's position until one of the two endings the clause itself names arrives: the " +
      "applicant supplied the requested information and the creditor took action and notified " +
      "under paragraph (a), or the designated time period lapsed without a response, after which " +
      "the clause says the creditor has no further obligation.",
    requires: ["artifact_logs_incompleteness_notice_sent"],
    binding: true,
    scope: "",
    domains: ["consumer-credit"],
    deontic_type: "obligation",
    defeasibility: "defeasible-modelled",
  },
  {
    id: "ecoa_reg_b_1002_4_a_no_disparate_treatment",
    source_document: "ECOA / Regulation B (12 CFR 1002.4)",
    article_clause: "12 CFR 1002.4(a)",
    verbatim_text:
      "A creditor shall not discriminate against an applicant on a prohibited basis regarding any " +
      "aspect of a credit transaction.",
    stakeholder: "applicant",
    formalism: "counterfactual",
    spec: "counterfactually_invariant(artifact_logs_decision_record, applicant_prohibited_basis)",
    rationale:
      "No applicant's decision would have been different had the prohibited basis alone been " +
      "different. `applicant_prohibited_basis` is an input the decision procedure accepts and not " +
      "a field a decision record must carry. A system whose declared logic has no notion of the " +
      "variable is reported unattainable and never satisfied, because not knowing a prohibited " +
      "basis is not evidence of not using one.",
    requires: ["artifact_logs_decision_record", "applicant_prohibited_basis"],
    binding: true,
    scope: "",
    domains: ["consumer-credit"],
    deontic_type: "prohibition",
    defeasibility: "strict",
  },
]

/** The ECOA / Regulation B pack. */
export function ecoaPack() {
  return {
    id: "ecoa",
    title: "ECOA / Regulation B (12 CFR 1002.9): Adverse Action Notices",
    description:
      "Requirements for adverse credit decision notifications, specific principal reasons, and record retention.",
    source_metadata: {
      document: "CFPB Regulation B / Equal Credit Opportunity Act (12 CFR § 1002.9)",
      publication: "Code of Federal Regulations, Title 12, Chapter X, Part 1002",
      url: "https://www.consumerfinance.gov/rules-policy/regulations/b/9/",
    },
    requirements,
  }
}