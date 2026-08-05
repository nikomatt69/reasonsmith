/**
 * `reasonsmith serve` — the conformance report over HTTP, for the TUI to attach to.
 *
 * This is nikcli's serve/attach split: the server runs the check, the TUI is a client of it, and
 * neither has to be in the other's process. Built on Effect's own HTTP stack — `HttpRouter` /
 * `HttpServerResponse` from `effect/unstable/http`, served by `BunHttpServer.layer` from
 * `@effect/platform-bun`, launched through `BunRuntime.runMain`. (In this beta line the HTTP
 * modules live under `effect/unstable/http`, not in a separate `@effect/platform` package.)
 *
 * What a reader must not break:
 *   - **`GET /report` returns exactly `ConformanceReport.toDict()`** — the same envelope `check
 *     --json` prints, `schema_version` and all. The TUI parses it, and a wrapper invented here
 *     would be a second machine record that could drift from the first.
 *   - `GET /report/text` is the *rendering*, and it is projected by `?audience=`. The JSON is not,
 *     for the reason `check --json` is not: a consumer must not lose fields to a display flag.
 *   - A run whose system or pack cannot be resolved answers 400 with the reason, never 500 and never
 *     an empty report. A usage error over HTTP is still a usage error.
 *   - Nothing here caches a report. A system is executed per request because a decision log can
 *     change under it, and serving a stale verdict is the one failure a compliance surface must not
 *     have.
 */

import { Cause, Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"

import { AUDIENCES, type Audience, listPacks, loadPack, renderText } from "@reasonsmith/core"

import { cmd } from "./cmd.ts"
import { exitCodeFor, runCheck } from "../run.ts"
import { SHIPPED_SYSTEMS, SHIPPED_SYSTEM_NAMES, UsageError, resolveSystem } from "../system.ts"

/** The query a report request carries, read once so both report routes agree on it. */
interface ReportQuery {
  pack: string
  system?: string
  systemModule?: string
  systemName: string
  systemScope: string | null
  systemDomains: string[] | null
  requirements: string[]
  audience: Audience
}

function readQuery(url: URL): ReportQuery {
  const params = url.searchParams
  const pack = params.get("pack")
  if (!pack) {
    throw new UsageError(`?pack= is required. Built-in packs: ${listPacks().join(", ")}`)
  }
  const audience = params.get("audience") ?? "auditor"
  if (!(AUDIENCES as readonly string[]).includes(audience)) {
    throw new UsageError(`?audience=${audience} is not one of ${AUDIENCES.join(", ")}`)
  }
  const domains = params.getAll("system-domain")
  return {
    pack,
    system: params.get("system") ?? undefined,
    systemModule: params.get("system-module") ?? undefined,
    systemName: params.get("system-name") ?? "SUT",
    systemScope: params.get("system-scope"),
    systemDomains: domains.length > 0 ? domains : null,
    requirements: params.getAll("requirement"),
    audience: audience as Audience,
  }
}

const reportFor = (query: ReportQuery) =>
  Effect.gen(function* () {
    const { sut } = yield* Effect.promise(() =>
      resolveSystem({ system: query.system, systemModule: query.systemModule }),
    )
    // Synchronous, because the domain is: `checkConformance` is a pure function of the system and
    // the pack, and wrapping it in an effect would suggest otherwise.
    return runCheck({
      pack: query.pack,
      sut,
      systemName: query.systemName,
      systemScope: query.systemScope,
      systemDomains: query.systemDomains,
      requirements: query.requirements,
    })
  })

/** A usage error is 400 and says why; anything else is 500 and says what threw. */
const asResponse = (error: unknown) => {
  const failure = unwrapCause(error)
  // `jsonUnsafe`, not `json`: the latter answers with an Effect, and a route handler that yielded
  // one where a response was expected would type-check only by accident.
  return failure instanceof UsageError
    ? HttpServerResponse.jsonUnsafe({ error: failure.message }, { status: 400 })
    : HttpServerResponse.jsonUnsafe(
        { error: failure instanceof Error ? failure.message : String(failure) },
        { status: 500 },
      )
}

/**
 * The original error back out of a cause, whichever channel holds it.
 *
 * `Cause.squash` is the supported way and is asked first. Reaching into `reasons` by hand does not
 * work here: in this beta line a thrown `UsageError` lands as a defect nested a level deeper than a
 * hand-written walk expects, and a walk that missed it answered 500 for every usage mistake — which
 * is precisely the failure this server's error contract names.
 */
function unwrapCause(error: unknown): unknown {
  if (error !== null && typeof error === "object" && Cause.isCause(error)) {
    return Cause.squash(error)
  }
  return error
}

const withRequestUrl = <A, E, R>(f: (url: URL) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    return yield* f(new URL(request.url, "http://localhost"))
  })

const HealthRoute = HttpRouter.add(
  "GET",
  "/health",
  HttpServerResponse.json({ status: "ok", packs: listPacks(), systems: SHIPPED_SYSTEM_NAMES }),
)

const PacksRoute = HttpRouter.add(
  "GET",
  "/packs",
  Effect.sync(() =>
    HttpServerResponse.jsonUnsafe(
      listPacks().map((name) => {
        const pack = loadPack(name)
        return {
          id: pack.id,
          title: pack.title,
          description: pack.description,
          requirements: pack.requirements.length,
          binding: pack.requirements.filter((r) => r.binding).length,
        }
      }),
    ),
  ),
)

const SystemsRoute = HttpRouter.add(
  "GET",
  "/systems",
  Effect.sync(() =>
    HttpServerResponse.jsonUnsafe(
      SHIPPED_SYSTEM_NAMES.map((name) => ({ name, describe: SHIPPED_SYSTEMS[name].describe })),
    ),
  ),
)

/**
 * Both channels, because a `UsageError` raised inside `Effect.gen` arrives as a **defect** and not
 * as a typed failure. Catching only `Effect.catchAll` would leave every usage mistake answering 500,
 * which is the one thing this server's error contract says it must not do.
 */
const refuseCleanly = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A | HttpServerResponse.HttpServerResponse, never, R> =>
  // `catchCause` rather than a typed catch: it is the one combinator covering both channels, and
  // `unwrapCause` digs the original error back out of whichever side holds it.
  effect.pipe(Effect.catchCause((cause) => Effect.succeed(asResponse(cause))))

const ReportRoute = HttpRouter.add(
  "GET",
  "/report",
  withRequestUrl((url) =>
    Effect.gen(function* () {
      const query = readQuery(url)
      const report = yield* reportFor(query)
      // Exactly `toDict()`. The TUI reads this, and `check --json` prints the same thing.
      return HttpServerResponse.jsonUnsafe(report.toDict())
    }).pipe(refuseCleanly),
  ),
)

const ReportTextRoute = HttpRouter.add(
  "GET",
  "/report/text",
  withRequestUrl((url) =>
    Effect.gen(function* () {
      const query = readQuery(url)
      const report = yield* reportFor(query)
      return HttpServerResponse.text(renderText(report, query.audience), {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          // The exit code a `check` run would have earned, so a client scripting against the
          // server does not have to re-derive the contract.
          "x-reasonsmith-exit-code": String(exitCodeFor(report)),
        },
      })
    }).pipe(refuseCleanly),
  ),
)

export const ServeCommand = cmd({
  command: "serve",
  describe: "serve conformance reports over HTTP, for the TUI or another client to attach to",
  builder: (yargs) =>
    yargs
      .option("port", {
        type: "number",
        default: 8765,
        describe: "port to listen on",
      })
      .option("host", {
        type: "string",
        default: "127.0.0.1",
        describe: "hostname to bind. The default is loopback: a conformance report is not public",
      })
      .epilogue(
        "routes:\n" +
          "  GET /health                       what this build ships\n" +
          "  GET /packs                        the packs, with their requirement counts\n" +
          "  GET /systems                      the systems this package ships\n" +
          "  GET /report?pack=&system=         the complete machine record (toDict())\n" +
          "  GET /report/text?pack=&system=    the text rendering, projected by &audience=\n" +
          "\n" +
          "example:\n" +
          "  reasonsmith serve --port 8765\n" +
          "  curl 'http://127.0.0.1:8765/report/text?pack=ecoa&system=truncating-credit'",
      ),
  handler: async (args) => {
    const port = args.port as number
    const host = args.host as string

    const Routes = Layer.mergeAll(
      HealthRoute,
      PacksRoute,
      SystemsRoute,
      ReportRoute,
      ReportTextRoute,
    )

    process.stdout.write(`reasonsmith serving on http://${host}:${port}\n`)

    BunRuntime.runMain(
      Layer.launch(
        HttpRouter.serve(Routes).pipe(
          Layer.provide(BunHttpServer.layer({ port, hostname: host })),
        ),
      ),
    )
  },
})
