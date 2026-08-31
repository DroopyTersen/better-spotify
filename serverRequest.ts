const EXTERNAL_PROTOCOLS = new Set(["http", "https"]);

/**
 * Reconstruct the browser-facing URL after Fly Proxy terminates TLS.
 * React Router compares this URL's origin with the Origin header on actions.
 */
export function withExternalOrigin(request: Request): Request {
  const host = request.headers.get("host")?.trim();
  const protocol = firstHeaderValue(
    request.headers.get("x-forwarded-proto")
  )?.toLowerCase();

  if (!host || !protocol || !EXTERNAL_PROTOCOLS.has(protocol)) return request;

  let externalOrigin: URL;
  try {
    externalOrigin = new URL(`${protocol}://${host}`);
  } catch {
    return request;
  }

  if (
    externalOrigin.username ||
    externalOrigin.password ||
    externalOrigin.pathname !== "/" ||
    externalOrigin.search ||
    externalOrigin.hash
  ) {
    return request;
  }

  const externalUrl = new URL(request.url);
  externalUrl.protocol = externalOrigin.protocol;
  externalUrl.hostname = externalOrigin.hostname;
  externalUrl.port = externalOrigin.port;

  if (externalUrl.href === request.url) return request;
  return new Request(externalUrl, request);
}

function firstHeaderValue(value: string | null): string | undefined {
  const firstValue = value?.split(",", 1)[0]?.trim();
  return firstValue || undefined;
}
