import { z } from "zod";

const JSON_CONTENT_TYPE = /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json$/i;

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly clientMessage: string,
    readonly headers?: HeadersInit
  ) {
    super(clientMessage);
    this.name = "ApiRequestError";
  }
}

/**
 * Reads and validates an authenticated JSON mutation without ever buffering
 * more than the endpoint's declared limit.
 */
export async function parseJsonMutation<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
  maxBytes: number
): Promise<z.output<Schema>> {
  if (request.method !== "POST") {
    throw new ApiRequestError(405, "Method not allowed", { Allow: "POST" });
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
  if (!contentType || !JSON_CONTENT_TYPE.test(contentType)) {
    throw new ApiRequestError(415, "Expected an application/json request");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    if (Number(declaredLength) > maxBytes) {
      throw new ApiRequestError(413, "Request body is too large");
    }
  }

  const rawBody = await readBodyWithinLimit(request, maxBytes);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    throw new ApiRequestError(400, "Request body must be valid JSON");
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiRequestError(400, "Request body is invalid");
  }

  return result.data as z.output<Schema>;
}

export function apiErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiRequestError) {
    return Response.json(
      { error: error.clientMessage },
      { status: error.status, headers: error.headers }
    );
  }

  return Response.json({ error: fallbackMessage }, { status: 500 });
}

async function readBodyWithinLimit(request: Request, maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("maxBytes must be a positive safe integer");
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ApiRequestError(413, "Request body is too large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
