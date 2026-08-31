import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ShouldRevalidateFunctionArgs } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/auth/auth.server";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { PageHeader } from "~/layout/PageHeader";
import {
  runSpotifyEndpointDiagnostics,
  SPOTIFY_DIAGNOSTIC_CHECK_IDS,
  SPOTIFY_DIAGNOSTIC_OUTCOMES,
  type SpotifyDiagnosticCheck,
  type SpotifyDiagnosticReport,
} from "~/spotify/api/spotifyDiagnostics";
import type { Route } from "./+types/spotify-diagnostics.route";

const MAX_BROWSER_REPORT_BYTES = 16 * 1024;

const SubmittedReportSchema = z.object({
  diagnosticId: z.uuid(),
  source: z.literal("browser"),
  report: z.object({
    allAvailable: z.boolean(),
    checks: z
      .array(
        z.object({
          id: z.enum(SPOTIFY_DIAGNOSTIC_CHECK_IDS),
          label: z.string().min(1).max(80),
          outcome: z.enum(SPOTIFY_DIAGNOSTIC_OUTCOMES),
          status: z.number().int().min(100).max(599).nullable(),
        })
      )
      .length(SPOTIFY_DIAGNOSTIC_CHECK_IDS.length),
  }),
});

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await requireAuth(request);
  const diagnosticId = crypto.randomUUID();
  const report = await runSpotifyEndpointDiagnostics(
    user.tokens.accessToken
  );
  logReport(diagnosticId, "server", report);

  return {
    diagnosticId,
    ranAt: new Date().toISOString(),
    report,
  };
};

export const action = async ({ request }: Route.ActionArgs) => {
  await requireAuth(request);
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Expected JSON" }, { status: 415 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_BROWSER_REPORT_BYTES
  ) {
    return Response.json({ error: "Report too large" }, { status: 413 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BROWSER_REPORT_BYTES) {
    return Response.json({ error: "Report too large" }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid report" }, { status: 400 });
  }
  const parsed = SubmittedReportSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Invalid report" }, { status: 400 });
  }

  logReport(
    parsed.data.diagnosticId,
    parsed.data.source,
    parsed.data.report
  );
  return Response.json(
    { recorded: true },
    { headers: { "Cache-Control": "no-store" } }
  );
};

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  // These checks are deliberately on-demand. Parent-layout refreshes (for
  // example after a library sync) must not turn one diagnostic run into
  // another burst of Spotify API requests.
  if (
    !formMethod &&
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search === nextUrl.search
  ) {
    return false;
  }
  return defaultShouldRevalidate;
}

export default function SpotifyDiagnosticsRoute({
  loaderData,
}: Route.ComponentProps) {
  const currentUser = useCurrentUser();
  const [browserReport, setBrowserReport] =
    useState<SpotifyDiagnosticReport | null>(null);

  useEffect(() => {
    const accessToken = currentUser?.tokens.accessToken;
    if (!accessToken) return;
    const controller = new AbortController();
    let active = true;

    void runSpotifyEndpointDiagnostics(accessToken, {
      signal: controller.signal,
    }).then((report) => {
      if (!active) return;
      setBrowserReport(report);
      void submitBrowserReport(loaderData.diagnosticId, report);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [currentUser?.tokens.accessToken, loaderData.diagnosticId]);

  return (
    <>
      <PageHeader>Spotify Diagnostics</PageHeader>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-10">
        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <p className="font-medium">Read-only account checks</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            This page tests Spotify access from Fly and from this browser. It
            never displays or records tokens, response bodies, or library
            contents.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Diagnostic ID: {loaderData.diagnosticId}</span>
            <span>{new Date(loaderData.ranAt).toLocaleString()}</span>
          </div>
        </section>

        <DiagnosticPanel
          title="Fly server → Spotify"
          description="Confirms your deployed session and Spotify account permissions."
          report={loaderData.report}
        />
        <DiagnosticPanel
          title="This browser → Spotify"
          description="Confirms mobile networking, CORS, and the browser-held access token."
          report={browserReport}
        />

        <section className="rounded-xl border bg-card p-4 text-sm leading-6 text-muted-foreground sm:p-5">
          <p>
            Matching failures usually indicate Spotify account, permission, or
            quota policy. A browser-only failure points to the mobile request
            path. If every quick check passes, the remaining fault is inside
            the local synchronization pipeline.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground"
          >
            <RefreshCw className="size-4" />
            Run again
          </button>
        </section>
      </div>
    </>
  );
}

function DiagnosticPanel({
  title,
  description,
  report,
}: {
  title: string;
  description: string;
  report: SpotifyDiagnosticReport | null;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {!report ? (
          <LoaderCircle className="size-5 shrink-0 animate-spin text-primary" />
        ) : report.allAvailable ? (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
        ) : (
          <CircleAlert className="size-5 shrink-0 text-amber-300" />
        )}
      </div>

      {!report ? (
        <p className="mt-5 text-sm text-muted-foreground">Running checks…</p>
      ) : (
        <ul className="mt-5 divide-y divide-border rounded-lg border">
          {report.checks.map((check) => (
            <DiagnosticRow key={check.id} check={check} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DiagnosticRow({ check }: { check: SpotifyDiagnosticCheck }) {
  const available = check.outcome === "available";
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
      <span>{check.label}</span>
      <span
        className={
          available
            ? "text-emerald-300"
            : "text-right font-medium text-amber-200"
        }
      >
        {formatOutcome(check)}
      </span>
    </li>
  );
}

function formatOutcome(check: SpotifyDiagnosticCheck): string {
  const status = check.status ? ` (HTTP ${check.status})` : "";
  const labels: Record<SpotifyDiagnosticCheck["outcome"], string> = {
    available: "Available",
    unauthorized: "Token rejected",
    forbidden: "Permission denied",
    rate_limited: "Rate limited",
    quota_exceeded: "Quota exceeded",
    invalid_response: "Unexpected response",
    network_error: "Network blocked",
    provider_error: "Spotify error",
  };
  return `${labels[check.outcome]}${status}`;
}

async function submitBrowserReport(
  diagnosticId: string,
  report: SpotifyDiagnosticReport
) {
  try {
    await fetch("/diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diagnosticId, source: "browser", report }),
    });
  } catch {
    // The results remain visible even if this best-effort report cannot be logged.
  }
}

function logReport(
  diagnosticId: string,
  source: "server" | "browser",
  report: SpotifyDiagnosticReport
) {
  console.info(
    "Spotify diagnostics",
    JSON.stringify({
      diagnosticId,
      source,
      allAvailable: report.allAvailable,
      checks: report.checks.map(({ id, outcome, status }) => ({
        id,
        outcome,
        status,
      })),
    })
  );
}
