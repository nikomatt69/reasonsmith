# reasonsmith, in TypeScript

A re-implementation of the Python package in Effect TS and OpenTUI, as a bun workspaces monorepo.
It is a **port of the semantics**, not an adaptation: the strength lattice, the four verdicts, the
evidence basis, the engine ladder, the pack and system protocols, the unattainable analysis and the
reason-deletion certificate are the ones `src/reasonsmith/` implements, and where this build cannot
reach a rung it says so rather than reaching a weaker one and calling it the same name.

```
packages/
  core/      the domain: property language, packs, result model, gates, ladder, certificate
  engines/   the rungs this build stands on
  systems/   the demonstration systems, including the one that comes back violated
  cli/       the front door
  tui/       the report browser
```

Install and run:

```sh
bun install
bun run typecheck        # turbo, every package
bun test                 # turbo, every package
```

## The finding, which is the reason to read any of this

Run the ECOA pack against the deployed credit system and two duties drawn from the **same clause**
disagree:

| duty | 12 CFR 1002.9(b)(2) asks | verdict | rung | basis |
|---|---|---|---|---|
| `..._specific_reasons` | is a statement of reasons present, scoped, and not one of the two the clause itself calls insufficient? | **satisfied** | `observed` | behavioural |
| `..._principal_reasons_complete` | does the statement indicate the *principal reason(s)*? | **violated** | `probed` | artifact |

On decision `APP-1042` exact inference finds five reasons and the deletion probe shows the deployed
engine's answer depends on **one**. The other four — C02 through C05 — are reasons its own inference
had and its notice does not state. The engine is a top-1 proof truncator, and the certificate says
so in those words, because the deleted reasons are exactly the four lowest-scoring.

**Form completeness does not imply reason fidelity.** A tool whose strongest reason-giving check was
"the reason field is non-blank" would report this system clean. `packages/systems/src/truncating-credit-system.test.ts`
is the pin; if those two verdicts ever agree, either the certificate stopped measuring or the ladder
started letting something weaker answer the adequacy duty.

The count is **measured, never read from the log**. The system declares it can expose the artefact;
no record carries the number, and the engine would overwrite it if one did.

## What this build does not have

Two rungs of the Python build rest on an SMT solver, and there is none here. They are **absent**, not
approximated — `@reasonsmith/engines` exports `MISSING_RUNGS` naming them and why:

| rung | fragment | consequence |
|---|---|---|
| `proved` | `record`, `logical`, `temporal` | a system exposing `logic()` falls to `probed` where `decide()` exists, and to `observed` otherwise |
| `proved` / `probed` | `counterfactual` | the fragment has **no trace rung by construction**, so a counterfactual duty is reported *not evaluated* — never satisfied, never answered off a log |

That last one matters more than it looks. The relational fragment's refusal of a trace rung is a
property of the language, not a policy the ladder is trusted to keep: a trace holds what the system
decided and a counterfactual asks what it would have decided. Reporting one from a log would be the
overclaim the package exists to refuse, so this build reports nothing instead.

Two rungs also mean the Python's three-system demonstration ends differently here. There the trio
finishes with a symbolic rule set reaching `proved` over every input its declared constraints admit;
porting that system would have shown a ceiling of `probed` under a name promising more, so this build
uses the artefact-exposing system for the third slot and states the substitution.

## Where the port had to decide rather than transcribe

Three places. Each is a mechanism swap under an unchanged contract, and each is written down at the
top of the module that makes it.

**The engine ladder cannot import an engine.** Python resolves each rung with a late `import` inside
`report._engine_ladder`. Here the dependency runs `core <- engines`, so the ladder asks an engine
table that `@reasonsmith/engines` fills in on import. The guarantee is unchanged and stated in
`core/src/engine-registry.ts`: a rung absent from the table is a rung the ladder does not append, and
a weaker engine never substitutes for a missing stronger one. `DELETED_REASON_COUNT` moved to `core`
for the same reason — the ladder and the basis derivation both test it, and in this direction the
constant has to be stated where both sides can see it.

**MARCO's unexplored region is held in a small DPLL, not Z3** (`core/src/sat.ts`). The question asked
of the solver is identical. What matters is that the solver is *complete*: `DeletionSearch.exhaustive`
is the bound on every reason called `deleted`, and a solver that gave up early while reporting
unsatisfiable would turn "the lattice is covered" into "we stopped looking" without saying so.

**The trace monitor is the reference interpreter, not rtamt** (`engines/src/observed.ts`). Boolean
rather than quantitative, so there is no robustness margin — the exact-tie case rtamt scores as zero
robustness is decided by the comparison itself, which is what the language says. In exchange the
witness is named by position and by the record's own identifier, which one number for the whole
formula could not do.

One smaller one: the probed engine's PRNG is mulberry32 rather than Python's Mersenne Twister, so the
*plan* differs between builds. The guarantee does not — it is re-derivable from
`(spec, records, trials, seed)`, and the seed travels in the recorded budget.

## The rules that survived the port intact

- **No result may claim more than it has.** `RequirementResult` refuses at construction: a `probed`
  result with no search budget, a `not_applicable` result carrying a strength, a result with no
  strength reported satisfied, a rung its evidence basis does not admit, a plug-in above its declared
  ceiling, a claim above a recounted reason set.
- **The evidence basis is a kind and never a rank.** Four members, no order between them, each
  admitting its own rungs. Derived from the *requirement alone* and stamped once, so no adapter can
  widen what a duty claims.
- **Combining zero verdicts is `inconclusive`**, never vacuously satisfied.
- **An empty trace is never evidence.** Not satisfied, not `0.0`, not the top of the lattice written
  as a verdict.
- **An implication whose antecedent nothing satisfied is not evaluated**, naming the antecedent and
  the domain — a fact about the *formula*, so it is written once and every rung asks it.
- **A violation needs one witness; a satisfaction needs complete evidence.** The probed and
  certificate rungs both refuse to report satisfied over the part of a search space that answered.
- **The unattainable analysis never executes the system**, and the trace is read at most once per
  run — and not at all when nothing in the pack is applicable, attainable and checkable.
- **The two applicability gates are decided in one place**, so a system that has not declared its
  domain is never reported satisfied on a domain-limited duty.
- **The five audience projections are the documented ones** — `developer`, `deployer`, `auditor`,
  `regulator`, `affected-individual` — with `auditor` the full report by identity and an unknown
  audience refused rather than widened. The lay artefact carries **no system internals at all** and
  is a *derivation*, not a subset of an expert one: `core/src/render.test.ts` asserts that as an
  exclusion over the run's own data, so a change that adds a leak fails rather than passes.

## Reading order

`core/src/report.ts` for what a result may claim, `core/src/check-conformance.ts` for the gates and
the ladder, `core/src/certificate.ts` for what a `deleted` reason is, then
`engines/src/certificate.ts` for the duty that makes it a verdict.

The Python remains the authority. Where this build and `src/reasonsmith/` disagree, the Python wins,
or the disagreement is a finding to report.
