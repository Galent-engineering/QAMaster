/**
 * Q53: what the app itself reports during a case. A 5xx answer from the app's origins and an uncaught page error fail
 * the case, even when every step passed, unless the gate's allowErrors list names it (a string found in the URL or the
 * message). QAMaster's runner hands the list over in QAMASTER_ALLOW_ERRORS as JSON. No Playwright import: it takes
 * anything shaped like a page, so the engine's tests can drive it.
 */
export type AppError =
  | { kind: 'request'; method: string; url: string; status: number; body: string }
  | { kind: 'page'; message: string };

type Response = {
  url(): string;
  status(): number;
  request(): { method(): string };
  text(): Promise<string>;
};
type WatchedPage = {
  on(event: 'response', fn: (r: Response) => void): unknown;
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

export function watchApp(page: WatchedPage, origins: string[], allow: string[]) {
  const found: AppError[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', (r) => {
    let origin = '';
    try {
      origin = new URL(r.url()).origin;
    } catch {
      return;
    }
    if (r.status() < 500 || !origins.includes(origin)) return;
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
  const text = (e: AppError) => (e.kind === 'request' ? e.url : e.message);
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
            : `Uncaught page error: ${e.message}`,
        )
        .join('\n\n');
    },
  };
}
