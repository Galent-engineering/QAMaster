/**
 * qam ado call: one Azure DevOps REST call, for Claude's own ADO work when the az CLI can't do it (skill ADO-API). It
 * uses the adapter's auth (QAMASTER_ADO_TOKEN or az login), retries and error messages, and follows page tokens.
 *
 *     qam ado call <METHOD> <path> [--org-level] [--param k=v …] [--body <file.json>] [--patch] [--all-pages] [--apply]
 *
 * <path> is relative to https://dev.azure.com/<org>/<project>/_apis/ (or /<org>/_apis/ with --org-level), for example
 * testplan/plans. Anything but GET writes, so it needs --apply, which Claude passes only after the person's yes.
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { AdoClient, adoSettings, authHeader } from '../adapters/ado.mts';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';

const USAGE =
  'Use qam ado call <GET|POST|PATCH|DELETE> <path> [--org-level] [--param k=v] [--body file.json] [--patch] [--all-pages] [--apply].';

export async function ado(cfg: Config, argv: string[], json: boolean): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (e) {
    throw new BlockedError(`qam ado: ${(e as Error).message}. ${USAGE}`);
  }
  const { values: v, positionals } = parsed;
  const [cmd, rawMethod, route] = positionals;
  const method = rawMethod?.toUpperCase();
  if (cmd !== 'call' || !method || !route || !['GET', 'POST', 'PATCH', 'DELETE'].includes(method))
    throw new BlockedError(USAGE);
  // a WIQL query is a POST that only reads
  const reads = method === 'GET' || (method === 'POST' && route.replace(/^\//, '') === 'wit/wiql');
  if (!reads && !v.apply)
    throw new BlockedError(
      `${method} ${route} changes Azure DevOps. Show the person what it will change, and add --apply only after their yes.`,
    );
  const params: Record<string, string> = {};
  for (const p of v.param ?? []) {
    const i = p.indexOf('=');
    if (i < 1) throw new BlockedError(`--param ${p} isn't key=value.`);
    params[p.slice(0, i)] = p.slice(i + 1);
  }
  let body: unknown;
  if (v.body) {
    try {
      body = JSON.parse(fs.readFileSync(v.body, 'utf8'));
    } catch (e) {
      throw new BlockedError(`--body ${v.body} isn't a readable JSON file (${(e as Error).message}).`);
    }
  }
  const s = adoSettings(cfg);
  const client = new AdoClient(s.organization, s.project, () => authHeader(cfg.env));
  const result =
    v['all-pages'] && method === 'GET'
      ? { value: await client.pages(route, params) }
      : await client.send(method, route, {
          orgLevel: v['org-level'],
          params,
          ...(v.patch ? { patch: body } : { json: body }),
        });
  console.log(JSON.stringify(result, null, json ? undefined : 1));
  return 0;
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'org-level': { type: 'boolean' },
      param: { type: 'string', multiple: true },
      body: { type: 'string' },
      patch: { type: 'boolean' },
      'all-pages': { type: 'boolean' },
      apply: { type: 'boolean' },
    },
  });
}
