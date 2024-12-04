import { z } from "zod";
export type RequestOptions = Partial<RequestInit>;

/**
 * Smartly merges RequestInit properties.
 * It merges the headers separately so you don't blow away the default headers
 * If you need to delete a header that is coming from a default, set that header to an empty string.
 */
export const mergeRequestOptions = (
  defaults: RequestOptions,
  overrides?: RequestOptions
): RequestOptions => {
  let options: any = {
    ...defaults,
    ...overrides,
    headers: {
      ...defaults?.headers,
      ...overrides?.headers,
    },
  };

  // When posting multipart/form-data, you apparently
  // can't set a content type header yourself, browser needs
  // to do it. Allow the override to remove the header by
  // setting it to blank
  if (options.headers["content-type"] === "") {
    delete options.headers["content-type"];
  }
  return options;
};

export const JSON_DEFAULTS: RequestOptions = {
  method: "GET",
  headers: {
    accept: "application/json",
    "content-type": "application/json",
  },
};

export async function fetchStream(
  url: string,
  options?: Partial<RequestInit>
): Promise<Response> {
  const defaults = {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    signal: options?.signal,
  };

  let reqOptions = mergeRequestOptions(defaults, options);

  try {
    const resp = await fetch(url, reqOptions);
    if (resp.ok) {
      return resp;
    } else {
      throw new Error(
        await getFetchErrorMessage("Unsuccessful status code", { url }, resp)
      );
    }
  } catch (err: any) {
    throw new Error(
      await getFetchErrorMessage(err?.message, { url, ...reqOptions })
    );
  }
}

export async function jsonRequest<T = any>(
  url: string,
  options?: Partial<RequestInit>
): Promise<T> {
  let reqOptions = mergeRequestOptions(JSON_DEFAULTS, options);

  try {
    const resp = await fetch(url, reqOptions);
    if (resp.ok) {
      return resp.json() as Promise<T>;
    } else {
      throw new Error(
        await getFetchErrorMessage("Unsuccessful status code", { url }, resp)
      );
    }
  } catch (err: any) {
    throw new Error(
      await getFetchErrorMessage(err?.message, { url, ...reqOptions })
    );
  }
}

export async function validatedJsonRequest<OutputSchema extends z.ZodTypeAny>(
  url: string,
  options: Partial<RequestInit>,
  outputSchema: OutputSchema
) {
  let data = await jsonRequest(url, options);
  let parsedResult = outputSchema.safeParse(data);
  if (!parsedResult.success) {
    console.error(
      `Server Response did not match expected schema:`,
      parsedResult.error
    );
    throw new Error(
      `The server returned an unexpected response: ${JSON.stringify(data)}`
    );
  }
  return parsedResult.data as z.infer<OutputSchema>;
}

export const getFetchErrorMessage = async (
  message = "",
  req: { url: string } & Partial<RequestInit>,
  resp?: Response
) => {
  let respBody = resp ? await resp?.text() : "";
  return `Request Error: ${message}\n\n${JSON.stringify(
    {
      req,
      resp: resp
        ? {
            status: resp?.status,
            statusText: resp?.statusText,
            body: respBody,
          }
        : undefined,
    },
    null,
    2
  )}`;
};
