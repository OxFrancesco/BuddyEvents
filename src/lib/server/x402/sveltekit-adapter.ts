import type { HTTPAdapter } from "@x402/core/server";

export class SvelteKitAdapter implements HTTPAdapter {
  constructor(private readonly request: Request) {}

  getHeader(name: string) {
    return this.request.headers.get(name) ?? undefined;
  }

  getMethod() {
    return this.request.method;
  }

  getPath() {
    return new URL(this.request.url).pathname;
  }

  getUrl() {
    return this.request.url;
  }

  getAcceptHeader() {
    return this.request.headers.get("accept") ?? "";
  }

  getUserAgent() {
    return this.request.headers.get("user-agent") ?? "";
  }

  getQueryParams() {
    const params = new URL(this.request.url).searchParams;
    const values: Record<string, string | string[]> = {};

    for (const key of params.keys()) {
      const all = params.getAll(key);
      values[key] = all.length > 1 ? all : (all[0] ?? "");
    }

    return values;
  }

  getQueryParam(name: string) {
    const values = new URL(this.request.url).searchParams.getAll(name);
    if (values.length === 0) return undefined;
    return values.length === 1 ? values[0] : values;
  }
}
