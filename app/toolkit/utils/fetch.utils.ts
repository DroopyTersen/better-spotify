/**
 * Smartly merges RequestInit properties.
 * It merges the headers separately so you don't blow away the default headers
 * If you need to delete a default header, set its override to an empty string.
 */
export const mergeRequestOptions = (
  defaults: Readonly<RequestInit>,
  overrides: Readonly<RequestInit> = {}
): RequestInit => {
  const headers = new Headers(defaults.headers);
  new Headers(overrides.headers).forEach((value, name) => {
    if (value === "") {
      headers.delete(name);
    } else {
      headers.set(name, value);
    }
  });

  return {
    ...defaults,
    ...overrides,
    headers,
  };
};

const JSON_DEFAULTS: RequestInit = {
  method: "GET",
  headers: {
    accept: "application/json",
    "content-type": "application/json",
  },
};

export async function jsonRequest<ResponseBody = unknown>(
  url: string,
  options?: Readonly<RequestInit>
): Promise<ResponseBody> {
  const reqOptions = mergeRequestOptions(JSON_DEFAULTS, options);
  let resp: Response;

  try {
    resp = await fetch(url, reqOptions);
  } catch {
    throw new Error(
      getFetchErrorMessage("Network request failed", {
        url,
        method: reqOptions.method,
      })
    );
  }

  if (!resp.ok) {
    throw new Error(
      getFetchErrorMessage(
        "Unsuccessful status code",
        { url, method: reqOptions.method },
        resp
      )
    );
  }

  return resp.json() as Promise<ResponseBody>;
}

export const getFetchErrorMessage = (
  message = "",
  req: { url: string; method?: string },
  resp?: Response
) => {
  const method = (req.method || "GET").toUpperCase();
  const status = resp ? ` (${resp.status})` : "";
  return `Request Error: ${message}${status}\n${method} ${safeRequestTarget(
    req.url
  )}`;
};

function safeRequestTarget(value: string) {
  try {
    const url = new URL(value, "http://local.invalid");
    return url.origin === "http://local.invalid"
      ? url.pathname
      : `${url.origin}${url.pathname}`;
  } catch {
    return "[invalid URL]";
  }
}
