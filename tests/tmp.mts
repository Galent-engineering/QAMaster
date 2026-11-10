/** Temp folders for tests, removed when the test file finishes, so test runs don't pile up in the system temp folder. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';

const made: string[] = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

export function tmpDir(prefix = 'qam-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}

// Tests never read the developer's own az defaults (~/.azure/azuredevops/config): an empty az config folder for this
// process and every qam it spawns, and no az devops override. A test that wants az defaults passes its own.
process.env.AZURE_CONFIG_DIR = tmpDir('qam-az-');
// Nor write the developer's home index (~/.qamaster/installs.json): doctor lists the QA project there (0.7.1 item 12).
process.env.QAMASTER_HOME = tmpDir('qam-home-');
delete process.env.AZURE_DEVOPS_EXT_CONFIG_DIR;
delete process.env.AZURE_DEVOPS_EXT__DEFAULTS_ORGANIZATION;
delete process.env.AZURE_DEVOPS_EXT__DEFAULTS_PROJECT;

// Nor the developer's Azure DevOps and store settings: tests that want them set them in the env they pass.
delete process.env.QAMASTER_ADO_ORG;
delete process.env.QAMASTER_ADO_PROJECT;
delete process.env.QAMASTER_STORE;
