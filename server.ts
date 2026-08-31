import { resolve, sep } from "node:path";
import { createRequestHandler, type ServerBuild } from "react-router";
import { withExternalOrigin } from "./serverRequest";

const port = parsePort(process.env.PORT);
const hostname = process.env.HOST?.trim() || "0.0.0.0";
const clientBuildDirectory = resolve(import.meta.dir, "build/client");
const serverBuildPath = "./build/server/index.js";
const build = (await import(serverBuildPath)) as ServerBuild;
const handleRequest = createRequestHandler(
  build,
  process.env.NODE_ENV ?? "production"
);

const server = Bun.serve({
  port,
  hostname,
  // Playlist progress streams can be quiet while Spotify or OpenAI works.
  idleTimeout: 0,
  async fetch(request) {
    const clientFileResponse = await serveClientFile(request);
    return clientFileResponse ?? handleRequest(withExternalOrigin(request));
  },
  error() {
    console.error("The application server could not handle a request");
    return new Response("Internal Server Error", { status: 500 });
  },
});

console.log(`Better Spotify listening on ${server.url.origin}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.stop(false);
  });
}

async function serveClientFile(request: Request): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  if (pathname.endsWith("/")) return null;

  const filePath = resolve(
    clientBuildDirectory,
    pathname.replace(/^\/+/, "")
  );
  if (
    filePath !== clientBuildDirectory &&
    !filePath.startsWith(`${clientBuildDirectory}${sep}`)
  ) {
    return new Response("Not Found", { status: 404 });
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;

  const headers = new Headers({
    "Cache-Control": pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
    "Content-Length": String(file.size),
    "Content-Type": file.type || "application/octet-stream",
  });
  return new Response(request.method === "HEAD" ? null : file, { headers });
}

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "3000", 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("PORT must be a valid TCP port");
  }
  return parsed;
}
