import { expect } from '@playwright/test';

/** An API response already read: status, headers and body, with assertions that name the request when they fail. */
export class ApiResponse<T = unknown> {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly status: number,
    readonly headers: Record<string, string>,
    readonly body: T,
    readonly durationMs: number,
  ) {}

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  expectStatus(...expected: number[]): this {
    expect(expected, `${this.method} ${this.url} returned ${this.status}: ${this.preview()}`).toContain(this.status);
    return this;
  }

  expectHeader(name: string, value: string | RegExp): this {
    const actual = this.headers[name.toLowerCase()];
    if (typeof value === 'string') expect(actual, `header ${name}`).toBe(value);
    else expect(actual, `header ${name}`).toMatch(value);
    return this;
  }

  /** The body holds at least these fields (a partial match, so an id or a timestamp the case doesn't know is fine). */
  expectBody(fields: Record<string, unknown>): this {
    expect(this.body as Record<string, unknown>, `${this.method} ${this.url} body: ${this.preview()}`).toMatchObject(fields);
    return this;
  }

  expectFasterThan(ms: number): this {
    expect(this.durationMs, `${this.method} ${this.url} took ${this.durationMs} ms`).toBeLessThan(ms);
    return this;
  }

  private preview(): string {
    const text = typeof this.body === 'string' ? this.body : JSON.stringify(this.body);
    return (text ?? '').slice(0, 300);
  }
}
