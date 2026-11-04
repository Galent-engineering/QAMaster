/**
 * A runner's setup problem, told apart from a test failure (Q41): a browser that isn't installed, a browser that can't
 * load its system libraries, or an app that doesn't answer at its base URL. The runners block on these with the
 * command that fixes them, instead of reporting every case as failed. The patterns are Playwright's own messages, as
 * seen on a clean machine (the clean-room Docker run, finding F2, docs/plans/0.3.1.md).
 */
export type Tooling = 'python' | 'node';

/** The fix for a setup problem found in a test's error output, or null when the output is a real test failure. */
export function setupProblem(output: string, tooling: Tooling, root: string, uv = false): string | null {
  if (/Executable doesn't exist at/.test(output)) {
    const cmd =
      tooling === 'node'
        ? 'npx playwright install chromium'
        : uv
          ? 'uv run playwright install chromium'
          : 'python3 -m playwright install chromium';
    return `Playwright's browser isn't installed for the tests in ${root}. Run ${cmd} there (it downloads the browser), then run again.`;
  }
  if (/error while loading shared libraries/.test(output)) {
    const lib = /error while loading shared libraries: (\S+?):/.exec(output)?.[1];
    return `The browser can't start: a system library is missing${lib ? ` (${lib})` : ''}. Run sudo npx playwright install-deps chromium (it installs the OS packages), then run again.`;
  }
  const refused = /net::ERR_CONNECTION_REFUSED at (\S+)/.exec(output);
  if (refused) {
    const url = refused[1].replace(/[#?].*$/, '');
    return `The app at ${url} didn't answer (connection refused). Start it, or point the tests at where it runs (WEB_BASE_URL, or the base URL in the test settings), then run again.`;
  }
  return null;
}
