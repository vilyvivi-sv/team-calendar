import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerColorMap, describeFilePickerError, getFilePickerStrategy, getOwnerPresentation, normalizeStatus, splitOwners } from './calendar-ui.mjs';

test('splits single and shared owners using common Chinese and English separators', () => {
  assert.deepEqual(splitOwners(' 方玉来、杨薇 '), ['方玉来', '杨薇']);
  assert.deepEqual(splitOwners('A, B；C'), ['A', 'B', 'C']);
  assert.deepEqual(splitOwners(''), []);
});

test('exposes only todo and done statuses while safely mapping legacy values to todo', () => {
  assert.equal(normalizeStatus('done'), 'done');
  assert.equal(normalizeStatus('doing'), 'todo');
  assert.equal(normalizeStatus('unknown'), 'todo');
});

test('assigns stable distinct colors to individual owners and a dedicated collaboration color', () => {
  const events = [
    { owner: '方玉来' },
    { owner: '杨薇' },
    { owner: '方玉来、杨薇' },
  ];
  const colors = buildOwnerColorMap(events);
  assert.notEqual(colors['方玉来'], colors['杨薇']);
  assert.deepEqual(buildOwnerColorMap([...events, { owner: '新成员' }], colors), {
    ...colors,
    '新成员': buildOwnerColorMap([{ owner: '新成员' }])['新成员'],
  });
  assert.equal(getOwnerPresentation('方玉来、杨薇', colors).kind, 'collaboration');
  assert.equal(getOwnerPresentation('方玉来', colors).kind, 'person');
  assert.equal(getOwnerPresentation('', colors).kind, 'unassigned');
});

test('offers direct local-file saving only in a secure context with browser support', () => {
  assert.equal(getFilePickerStrategy({ isSecureContext: true, showOpenFilePicker() {} }), 'native');
  assert.equal(getFilePickerStrategy({ isSecureContext: false, showOpenFilePicker() {} }), 'file-input');
  assert.equal(getFilePickerStrategy({ isSecureContext: true }), 'file-input');
});

test('explains picker cancellation and blocked access instead of failing silently', () => {
  assert.match(describeFilePickerError({ name: 'AbortError' }), /兼容选择入口/);
  assert.match(describeFilePickerError({ name: 'NotAllowedError' }), /兼容选择入口/);
  assert.match(describeFilePickerError({ name: 'SecurityError' }), /兼容选择入口/);
});
