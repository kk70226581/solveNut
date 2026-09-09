const test = require('node:test');
const assert = require('node:assert/strict');
const { expertProfiles } = require('../scripts/seed-experts.cjs');

test('expert seed includes a broad approved marketplace roster with complete profile details', () => {
  assert.equal(expertProfiles.length, 22);
  assert.equal(new Set(expertProfiles.map((expert) => expert.email)).size, expertProfiles.length);
  assert.ok(new Set(expertProfiles.map((expert) => expert.field)).size >= 6);

  const expandedProfiles = expertProfiles.slice(-10);
  assert.equal(expandedProfiles.length, 10);
  for (const expert of expandedProfiles) {
    assert.match(expert.email, /@experts\.solvenut\.demo$/);
    assert.ok(expert.avatar.startsWith('https://images.unsplash.com/'));
    assert.ok(expert.summary);
    assert.ok(expert.skills.length >= 3);
    assert.ok(expert.languages.length >= 1);
    assert.ok(expert.location);
    assert.ok(expert.sessionCount > 0);
  }
});
