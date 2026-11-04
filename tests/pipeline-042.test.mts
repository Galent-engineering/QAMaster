/** 0.4.2 W12: the pipeline finds the automation folder where qam app create makes it, under the PascalCase name. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { status } from '../plugin/src/pipeline/pipeline.mts';
import { tmpDir } from './tmp.mts';

const put = (dir: string, f: string, body = 'x') => {
  fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  fs.writeFileSync(path.join(dir, f), body);
};

test('stages 10-12 read DummyStaticWebsite/ for app dummy-static-website, not the clone of the same name', () => {
  const qa = tmpDir('qam-p042-');
  put(qa, 'dummy-static-website/index.html', '<h1>the clone</h1>');
  put(qa, 'DummyStaticWebsite/app.json', '{}');
  put(qa, 'DummyStaticWebsite/src/web/locators/home.locators.ts', 'export {}');
  put(qa, 'DummyStaticWebsite/features/home.feature', '@TC-HOME-001\nFeature: Home');
  const stages = status(qa, qa, 'dummy-static-website').stages;
  const stage = (id: string) => stages.find((s) => s.stage === id) as { status: string; evidence: string };
  assert.equal(stage('app-folder').status, 'done');
  assert.match(stage('app-folder').evidence, /DummyStaticWebsite\//);
  assert.equal(stage('locators').status, 'done');
  assert.equal(stage('scripts').status, 'done');
});
