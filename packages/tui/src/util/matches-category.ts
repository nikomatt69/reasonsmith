/**
 * Shared category filter predicate — status bar and findings list use the same rules.
 */

import type { RequirementResult } from "@reasonsmith/core"

export function matchesCategoryFilter(
  result: RequirementResult,
  key: string,
): boolean {
  if (key === "violated") return result.verdict === "violated"
  if (key === "not_applicable") return result.verdict === "not_applicable"
  if (key === "unattainable") return result.strength === "unattainable"
  if (key === "not_evaluated")
    return !result.evaluated && result.verdict !== "not_applicable" && result.basis !== "assessment"
  if (key === "on_an_assessment")
    return !result.evaluated && result.verdict !== "not_applicable" && result.basis === "assessment"
  if (key === "inconclusive")
    return result.verdict === "inconclusive" && result.evaluated && result.strength !== "unattainable"
  if (key === "proved" || key === "probed" || key === "recounted" || key === "observed")
    return result.verdict === "satisfied" && result.strength === key
  return true
}
