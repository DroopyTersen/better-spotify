import {
  isRouteErrorResponse,
  Links,
  LoaderFunctionArgs,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";
import { tryAuth } from "./auth/auth.server";
import { AlertTriangle } from "lucide-react";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  { rel: "stylesheet", href: stylesheet },
];

export function headers() {
  const responseHeaders: Record<string, string> = {
    "Cache-Control": "private, no-store",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
  if (process.env.NODE_ENV === "production") {
    responseHeaders["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains";
  }
  return responseHeaders;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let user = await tryAuth(request);
  return { currentUser: user };
};

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <Outlet
      context={{
        currentUser: loaderData.currentUser,
      }}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-5 flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <AlertTriangle className="size-5" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          Better Spotify
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{message}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">{details}</p>
        <a
          href="/"
          className="mt-7 inline-flex rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          Return to your library
        </a>
        {stack && (
          <pre className="mt-6 max-h-80 w-full overflow-auto rounded-lg bg-muted p-4 text-xs">
            <code>{stack}</code>
          </pre>
        )}
      </section>
    </main>
  );
}
