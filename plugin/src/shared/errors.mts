/**
 * QAMaster can't finish: bad config, missing credentials, unreachable service, wrong usage.
 * The message is shown to the user as is, so it says what to do next. The CLI turns it into exit code 2.
 */
export class BlockedError extends Error {
  override name = 'BlockedError';
}
