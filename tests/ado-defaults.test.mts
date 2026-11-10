/**
 * 0.6.0 item 10 (R24): the credential variables and defaults of `az devops` are read when QAMaster's own are unset.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { adoSettings, authHeader } from '../plugin/src/adapters/ado.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { azDefaults } from '../plugin/src/shared/env.mts';
import { tmpDir } from './tmp.mts';

/**
 * An az config folder (AZURE_CONFIG_DIR) whose azuredevops/config holds `[defaults]` as `az devops configure
 * --defaults` writes it. The core az config beside it has a [defaults] of its own, which must not be read.
 */
function azConfig(defaults: string): string {
  const dir = tmpDir('qam-az-');
  fs.writeFileSync(path.join(dir, 'config'), '[cloud]\nname = AzureCloud\n\n[defaults]\norganization = coreorg\n');
  fs.mkdirSync(path.join(dir, 'azuredevops'));
  fs.writeFileSync(path.join(dir, 'azuredevops', 'config'), `[defaults]\n${defaults}\n`);
  return dir;
}

test('R24: AZURE_DEVOPS_EXT_PAT is the token when QAMASTER_ADO_TOKEN is unset, and QAMaster own wins', () => {
  assert.equal(authHeader({ AZURE_DEVOPS_EXT_PAT: 'secret' }), 'Basic OnNlY3JldA==');
  assert.equal(authHeader({ QAMASTER_ADO_TOKEN: 'mine', AZURE_DEVOPS_EXT_PAT: 'theirs' }), 'Basic Om1pbmU=');
});

test('R24: the az default organization and project are read from its config file', () => {
  const env = { AZURE_CONFIG_DIR: azConfig('organization = https://dev.azure.com/galent\nproject = Shop') };
  assert.deepEqual(azDefaults(env), { organization: 'https://dev.azure.com/galent', project: 'Shop' });
  const s = adoSettings(loadConfig(tmpDir('qam-app-'), { ...env }));
  assert.equal(s.organization, 'galent');
  assert.equal(s.project, 'Shop');
});

test('R24: AZURE_DEVOPS_EXT_CONFIG_DIR names the az devops config folder itself', () => {
  const ext = tmpDir('qam-azext-');
  fs.writeFileSync(path.join(ext, 'config'), '[defaults]\norganization = extorg\nproject = extproj\n');
  const env = {
    AZURE_CONFIG_DIR: azConfig('organization = fileorg\nproject = fileproj'),
    AZURE_DEVOPS_EXT_CONFIG_DIR: ext,
  };
  assert.deepEqual(azDefaults(env), { organization: 'extorg', project: 'extproj' });
});

test('R24: the az devops default variables beat the file, and QAMASTER_ADO_* beat both', () => {
  const dir = tmpDir('qam-app-');
  const AZURE_CONFIG_DIR = azConfig('organization = fileorg\nproject = fileproj');
  const viaVars = adoSettings(
    loadConfig(dir, {
      AZURE_CONFIG_DIR,
      AZURE_DEVOPS_EXT__DEFAULTS_ORGANIZATION: 'varorg',
      AZURE_DEVOPS_EXT__DEFAULTS_PROJECT: 'varproj',
    }),
  );
  assert.deepEqual([viaVars.organization, viaVars.project], ['varorg', 'varproj']);
  const own = adoSettings(
    loadConfig(dir, { AZURE_CONFIG_DIR, QAMASTER_ADO_ORG: 'myorg', QAMASTER_ADO_PROJECT: 'myproj' }),
  );
  assert.deepEqual([own.organization, own.project], ['myorg', 'myproj']);
});

test('R24: no QAMaster setting and no az default still blocks, saying what to set', () => {
  const env = { AZURE_CONFIG_DIR: tmpDir('qam-az-empty-') };
  assert.throws(() => adoSettings(loadConfig(tmpDir('qam-app-'), env)), /QAMASTER_ADO_ORG/);
});

test('R24: the az defaults are taken as a pair, never to fill one QAMaster setting left out', () => {
  const dir = tmpDir('qam-app-');
  const AZURE_CONFIG_DIR = azConfig('organization = otherorg\nproject = OtherProject');
  // QAMaster names the organization: az's project belongs to another one, so it isn't borrowed
  assert.throws(
    () => adoSettings(loadConfig(dir, { AZURE_CONFIG_DIR, QAMASTER_ADO_ORG: 'myorg' })),
    /QAMASTER_ADO_PROJECT/,
  );
  assert.throws(
    () => adoSettings(loadConfig(dir, { AZURE_CONFIG_DIR, QAMASTER_ADO_PROJECT: 'myproj' })),
    /QAMASTER_ADO_ORG/,
  );
});
