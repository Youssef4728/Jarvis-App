import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function requestTarget(input: RequestInfo | URL) {
  const requestUrl = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
  const url = new URL(requestUrl);
  return `${url.host}${url.pathname}`;
}

export function createSupabaseFetch(fetcher: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const response = await fetcher(input, init);
    const contentType = response.headers.get("content-type") ?? "unknown";
    let isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType);
    if (!isHtml && !response.ok) {
      const prefix = (await response.clone().text()).slice(0, 512);
      isHtml = /^\s*(?:<!doctype html|<html\b)/i.test(prefix);
    }
    const target = requestTarget(input);

    if (isHtml) {
      throw new Error(
        `Supabase REST request returned HTTP ${response.status} at ${target} with content-type ${contentType}; received HTML instead of JSON. Check SUPABASE_URL and the project API endpoint.`
      );
    }

    if (!response.ok) {
      console.error("[supabase] REST request failed", {
        status: response.status,
        target,
        contentType,
        message: "Supabase REST API returned a non-success response.",
      });
    }

    return response;
  };
}

export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL und SUPABASE_SERVICE_KEY müssen gesetzt sein.");
  }

  if (!client) {
    client = createClient(url, key, { global: { fetch: createSupabaseFetch() } });
  }

  return client;
}
