import test from 'node:test';
import assert from 'node:assert/strict';
import { isAccountEnabled } from '../src/utils/features.ts';

const enabled = [{ name: 'account', enabled: true }];
const disabled = [{ name: 'account', enabled: false }];

test('development can enable accounts independently of Firestore', () => {
  assert.equal(isAccountEnabled([], 'development', 'true'), true);
  assert.equal(isAccountEnabled(disabled, 'development', 'true'), true);
});
test('development can hide accounts independently of Firestore', () => {
  assert.equal(isAccountEnabled(enabled, 'development', 'false'), false);
});
test('unset or invalid development overrides follow Firestore', () => {
  for (const override of ['', 'invalid']) {
    assert.equal(isAccountEnabled(enabled, 'development', override), true);
    assert.equal(isAccountEnabled(disabled, 'development', override), false);
    assert.equal(isAccountEnabled([], 'development', override), false);
  }
});
test('production always follows Firestore, ignoring local overrides', () => {
  for (const override of ['true', 'false', '']) {
    assert.equal(isAccountEnabled(enabled, 'production', override), true);
    assert.equal(isAccountEnabled(disabled, 'production', override), false);
    assert.equal(isAccountEnabled([], 'production', override), false);
  }
});
test('unrelated feature flags do not enable accounts', () => {
  assert.equal(isAccountEnabled([{ name: 'history', enabled: true }], 'production', ''), false);
});
