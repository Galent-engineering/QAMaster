/**
 * QAMaster can't finish: bad config, missing credentials, unreachable service, wrong usage.
 * The message is shown to the user as is, so it says what to do next. The CLI turns it into exit code 2.
 */
export class BlockedError extends Error {
  override name = 'BlockedError';
}

/**
 * The store has no test plan for this repo. The message lists the existing plans as numbered choices, the last being a
 * new plan, so every front end shows them; `plans` and `createName` are the same choices as data for `qam doctor --json`.
 */
export class NoPlanError extends BlockedError {
  override name = 'NoPlanError';
  readonly plans: { id: number; name: string }[];
  readonly createName: string;
  constructor(message: string, plans: { id: number; name: string }[], createName: string) {
    super(message);
    this.plans = plans;
    this.createName = createName;
  }
}
