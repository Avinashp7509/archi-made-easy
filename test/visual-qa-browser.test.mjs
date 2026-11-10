// Runs the automated visual QA (scripts/visual-qa.mjs) as part of the browser suite, on a
// reduced matrix: the standard laptop and the phone viewport, light theme. The full matrix
// (six viewports, both themes, screenshots) is run with `node scripts/visual-qa.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findChrome } from '../archi-made-easy/bin/visual-check.mjs';
import { runVisualQa, summarise, ARCHITECTURE_STATES, VIEWPORTS, THEMES } from '../scripts/visual-qa.mjs';

const chrome = process.env.ARCHI_MADE_EASY_CHROME ? findChrome() : null;

test('the matrix covers every workbench mode, the six required viewports and both themes', () => {
  assert.deepEqual(VIEWPORTS, [[1920, 1080], [1440, 900], [1366, 768], [1280, 800], [768, 1024], [390, 844]]);
  assert.deepEqual(THEMES, ['light', 'dark']);
  const acts = ARCHITECTURE_STATES.map((state) => state.act).join(' ');
  for (const mode of ['explore', 'review', 'simulate', 'security', 'performance', 'finops', 'optimize', 'decide', 'handoff']) {
    assert.ok(acts.includes(`data-workbench-mode=\\"${mode}\\"`) || acts.includes(`data-workbench-mode="${mode}"`), `${mode} is exercised`);
  }
  assert.equal(new Set(ARCHITECTURE_STATES.map((state) => state.id)).size, ARCHITECTURE_STATES.length, 'state ids are unique');
  for (const letter of 'ACDEFGHIJKMPS') assert.ok(ARCHITECTURE_STATES.some((state) => state.workflow === letter), `workflow ${letter} has a state`);
});

test('automated visual QA finds no critical or high defect', {
  skip: chrome ? false : 'Set ARCHI_MADE_EASY_CHROME to run the visual QA.',
}, async () => {
  const result = await runVisualQa({ chromePath: chrome, viewports: [[1440, 900], [390, 844]], themes: ['light'] });
  assert.ok(result.states >= 60, `states run: ${result.states}`);
  const blocking = summarise(result.defects).filter((defect) => defect.severity === 'critical' || defect.severity === 'high');
  assert.deepEqual(blocking.map((defect) => `${defect.check}: ${defect.detail} (${defect.examples[0]})`), []);
});
