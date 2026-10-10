import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, switchHousehold, addHousehold, renameHousehold, removeHousehold } from '../js/store.js';

const withData = () => {
  const s = defaultState();
  s.units = 420;
  s.bills = [{ id: 'b1', month: '2026-09', units: 420, amount: 20000 }];
  s.profile.discoId = 'mepco';
  s.lang = 'ur';
  return s;
};

test('households: adding one parks the current data and starts fresh', () => {
  const a = withData();
  const b = addHousehold(a, 'Upper portion');
  assert.equal(b.households.length, 2);
  assert.notEqual(b.active, 'h1');
  assert.equal(b.units, 300);
  assert.deepEqual(b.bills, []);
  assert.equal(b.profile.discoId, 'mepco', 'company carries over');
  assert.equal(b.lang, 'ur', 'language is global');
  assert.equal(b.households.find((h) => h.id === 'h1').data.units, 420);
});

test('households: switching back restores everything', () => {
  const b = addHousehold(withData(), 'Upper');
  b.units = 150;
  const c = switchHousehold(b, 'h1');
  assert.equal(c.active, 'h1');
  assert.equal(c.units, 420);
  assert.equal(c.bills.length, 1);
  assert.equal(c.households.find((h) => h.id === b.active).data.units, 150);
  assert.equal(c.households.find((h) => h.id === 'h1').data, undefined, 'active data lives at top level only');
});

test('households: rename and remove', () => {
  const b = addHousehold(withData(), 'Upper');
  const r = renameHousehold(b, 'h1', 'Ground floor');
  assert.equal(r.households[0].name, 'Ground floor');
  const d = removeHousehold(r, r.active);
  assert.equal(d.households.length, 1);
  assert.equal(d.active, 'h1');
  assert.equal(d.units, 420);
  assert.equal(removeHousehold(d, 'h1'), d, 'never removes the last one');
});
