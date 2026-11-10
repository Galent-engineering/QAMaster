import { type APIRequestContext, test } from '@playwright/test';
import { ApiResponse } from './ApiResponse';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  data?: unknown;
  form?: Record<string, string | number | boolean>;
  /** Retries on a network error or a 502, 503 or 504 (default 2 for GET, none otherwise). */
  retries?: number;
  timeoutMs?: number;
}

const SECRET = /authorization|cookie|token|password|secret|api[-_]?key/i;
/** A copy with every secret value hidden, for the request and response attached to the report. */
function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET.test(k) ? '***' : mask(v)]));
  return value;
}

/**
 * The base of every API service (one subclass per resource, in src/api/services/). It is the only place that calls
 * the request context: default and auth headers, a retry for transient failures, and the request and response
 * attached to the test report with secrets hidden. Steps call a service, never `request.fetch`.
 */
export abstract class BaseApiClient {
  private authHeaders: Record<string, string> = {};

  constructor(protected readonly request: APIRequestContext) {}

  /** Headers (an Authorization or Cookie) sent with every later request from this client. */
  setAuth(headers: Record<string, string>): this {
    this.authHeaders = { ...headers };
    return this;
  }

  clearAuth(): this {
    this.authHeaders = {};
    return this;
  }

  protected get<T>(path: string, opts?: RequestOptions) {
    return this.send<T>('GET', path, opts);
  }
  protected post<T>(path: string, opts?: RequestOptions) {
    return this.send<T>('POST', path, opts);
  }
  protected put<T>(path: string, opts?: RequestOptions) {
    return this.send<T>('PUT', path, opts);
  }
  protected patch<T>(path: string, opts?: RequestOptions) {
    return this.send<T>('PATCH', path, opts);
  }
  protected delete<T>(path: string, opts?: RequestOptions) {
    return this.send<T>('DELETE', path, opts);
  }

  protected async send<T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
    const headers = { ...this.authHeaders, ...opts.headers };
    const attempts = (opts.retries ?? (method === 'GET' ? 2 : 0)) + 1;
    const started = Date.now();
    let response = await this.attempt(method, path, headers, opts);
    for (let i = 1; i < attempts && (response === null || [502, 503, 504].includes(response.status())); i++) {
      await new Promise((r) => setTimeout(r, 500));
      response = await this.attempt(method, path, headers, opts);
    }
    if (response === null) throw new Error(`${method} ${path}: no response (network error)`);
    const durationMs = Date.now() - started;
    const text = await response.text();
    let body: unknown = text;
    if ((response.headers()['content-type'] ?? '').includes('json') && text) {
      try {
        body = JSON.parse(text);
      } catch {
        /* keep the text */
      }
    }
    const result = new ApiResponse<T>(method, response.url(), response.status(), response.headers(), body as T, durationMs);
    await this.attach(`Request ${method} ${path}`, { url: response.url(), headers, params: opts.params, body: opts.data ?? opts.form });
    await this.attach(`Response ${result.status} (${durationMs} ms)`, { headers: result.headers, body });
    return result;
  }

  /** One call; null on a network error so the caller may retry. */
  private async attempt(method: HttpMethod, path: string, headers: Record<string, string>, opts: RequestOptions) {
    try {
      return await this.request.fetch(path, {
        method,
        headers,
        params: opts.params,
        data: opts.data,
        form: opts.form,
        timeout: opts.timeoutMs,
      });
    } catch (e) {
      if (e instanceof Error && /ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|EAI_AGAIN/i.test(e.message)) return null;
      throw e;
    }
  }

  private async attach(name: string, content: unknown) {
    try {
      await test.info().attach(name, { body: JSON.stringify(mask(content), null, 2), contentType: 'application/json' });
    } catch {
      /* outside a test (a helper run on its own): nothing to attach to */
    }
  }
}
