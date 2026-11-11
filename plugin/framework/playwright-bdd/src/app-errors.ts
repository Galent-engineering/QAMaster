/**
 * Q53, Q58: what the app itself reports during a case. A 5xx answer from the app's origins, a request to them that got
 * no answer (a refused connection, a reset: anything but net::ERR_ABORTED, which is the page leaving) and an uncaught
 * page error fail the case, even when every step passed, unless the gate's allowErrors list names it: a string found
 * in the request's URL (not its status or body) or in a page error's message. QAMaster's runner hands the list over in
 * QAMASTER_ALLOW_ERRORS as JSON. The app's origins are baseURL (the caller's) and the API's: API_BASE_URL, else
 * apiUrl in app.json, read here so a fixtures.ts from before 0.8.0 watches the API too. No Playwright import: it
 * takes anything shaped like a page, so the engine's tests can drive it.
 */
import fs from 'node:fs';
import path from 'node:path';

export type AppError =
  | { kind: 'request'; method: string; url: string; status: number; body: string }
  | { kind: 'failed'; method: string; url: string; error: string }
  | { kind: 'page'; message: string };

type Response = {
  url(): string;
  status(): number;
  request(): { method(): string };
  text(): Promise<string>;
};
type FailedRequest = { url(): string; method(): string; failure(): { errorText: string } | null };
type WatchedPage = {
  on(event: 'response', fn: (r: Response) => void): unknown;
  on(event: 'requestfailed', fn: (r: FailedRequest) => void): unknown;
  on(event: 'pageerror', fn: (e: Error) => void): unknown;
};

const BODY_LIMIT = 1000;

/** The allow-list from QAMASTER_ALLOW_ERRORS: a JSON list of strings, else nothing allowed. */
export function parseAllow(raw: string | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) && v.every((s) => typeof s === 'string') ? v : [];
  } catch {
    return [];
  }
}

/** The API's base URL: API_BASE_URL, else apiUrl in the folder's app.json (the folder is src/'s parent). */
export function configuredApiUrl(env: Record<string, string | undefined> = process.env, dir?: string): string | undefined {
  if (env.API_BASE_URL) return env.API_BASE_URL;
  try {
    const root = dir ?? path.join(__dirname, '..');
    const url = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).apiUrl;
    return typeof url === 'string' && url ? url : undefined;
  } catch {
    return undefined; // no app.json here, or no apiUrl in it
  }
}

const originOf = (url: string | undefined): string | undefined => {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
};

export function watchApp(page: WatchedPage, origins: string[], allow: string[], apiUrl = configuredApiUrl()) {
  const found: AppError[] = [];
  const pending: Promise<void>[] = [];
  const watched = [...origins, originOf(apiUrl)].filter((o): o is string => !!o);
  page.on('requestfailed', (r) => {
    const error = r.failure()?.errorText ?? 'the request failed';
    // the page leaving or the browser dropping a request it no longer needs is not the app's error
    if (error === 'net::ERR_ABORTED' || !watched.includes(originOf(r.url()) ?? '')) return;
    found.push({ kind: 'failed', method: r.method(), url: r.url(), error });
  });
  page.on('response', (r) => {
    const origin = originOf(r.url());
    if (!origin) return;
    if (r.status() < 500 || !watched.includes(origin)) return;
    const at = found.length;
    found.push({ kind: 'request', method: r.request().method(), url: r.url(), status: r.status(), body: '' });
    // keep arrival order; the body is read after the answer, and may be gone
    pending.push(
      r.text().then(
        (body) => {
          (found[at] as { body: string }).body = body.slice(0, BODY_LIMIT);
        },
        () => {},
      ),
    );
  });
  page.on('pageerror', (e) => found.push({ kind: 'page', message: e.message }));
  const text = (e: AppError) => (e.kind === 'page' ? e.message : e.url);
  return {
    /** Everything the app reported that the allow-list doesn't name. */
    async finish(): Promise<AppError[]> {
      await Promise.all(pending);
      return found.filter((e) => !allow.some((a) => text(e).includes(a)));
    },
    describe(errors: AppError[]): string {
      return errors
        .map((e) =>
          e.kind === 'request'
            ? `${e.method} ${e.url} answered ${e.status}${e.body ? `:\n${e.body}` : ''}`
            : e.kind === 'failed'
              ? `${e.method} ${e.url} got no answer (${e.error})`
              : `Uncaught page error: ${e.message}`,
        )
        .join('\n\n');
    },
  };
}
