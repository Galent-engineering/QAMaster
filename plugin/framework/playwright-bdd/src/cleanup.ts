/**
 * Q58 (D20): a script undoes the test data it creates, so the test account is as it was after every run. A step that
 * creates something (a todo, an order, a user) registers its undo with the `cleanup` fixture right away; when the case
 * ends, whatever its result, the undos run last-in first-out. An undo that fails fails the case with
 * "left data on the test account: <label>", the failed labels, and the reason for each. No Playwright import: the
 * engine's tests drive it.
 *
 *     Given('I add a todo {string}', async ({ page, cleanup }, title: string) => {
 *       const id = await createTodo(page, title);
 *       cleanup.add(`todo "${title}"`, () => deleteTodo(id));
 *     });
 */
export type Undo = () => unknown | Promise<unknown>;
export type CleanupResult = { label: string; ok: boolean; error?: string };

export function createCleanup() {
  const undos: { label: string; undo: Undo }[] = [];
  return {
    /** Registers how to undo one thing the case created; `label` names it for the failure message. */
    add(label: string, undo: Undo): void {
      undos.push({ label, undo });
    },
    /** Runs every undo, newest first, and keeps going after one fails. */
    async run(): Promise<CleanupResult[]> {
      const results: CleanupResult[] = [];
      while (undos.length) {
        const { label, undo } = undos.pop() as { label: string; undo: Undo };
        try {
          await undo();
          results.push({ label, ok: true });
        } catch (e) {
          results.push({ label, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return results;
    },
    /** The failure's text, or '' when every undo worked. */
    describe(results: CleanupResult[]): string {
      const failed = results.filter((r) => !r.ok);
      if (!failed.length) return '';
      return [
        `left data on the test account: ${failed.map((r) => r.label).join(', ')}`,
        ...failed.map((r) => `  ${r.label}: ${r.error}`),
      ].join('\n');
    },
  };
}

export type Cleanup = ReturnType<typeof createCleanup>;
