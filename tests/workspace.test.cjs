const test = require('node:test');
const assert = require('node:assert/strict');

test('floating calls stay inside narrow and short viewports', async () => {
  const { clampFloatingRect } = await import('../src/utils/callLayout.js');
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    const box = clampFloatingRect({ x: 1400, y: 800, width: 960, height: 760 }, viewport);
    assert.ok(box.x >= 8 && box.y >= 8);
    assert.ok(box.x + box.width <= viewport.width - 8);
    assert.ok(box.y + box.height <= viewport.height - 8);
  }
});

test('decision storage isolates accounts and recovers malformed data', async () => {
  const { dashboardKey, readDecisions } = await import('../src/utils/dashboardStorage.js');
  const data = new Map();
  const storage = { getItem: key => data.get(key) };
  data.set(dashboardKey('A@example.com', 'decisions'), JSON.stringify([{ id: 1, title: 'Career decision' }, null, {}]));
  assert.equal(readDecisions(storage, 'a@example.com').length, 1);
  assert.deepEqual(readDecisions(storage, 'b@example.com'), []);
  data.set(dashboardKey('a@example.com', 'decisions'), '{broken');
  assert.deepEqual(readDecisions(storage, 'a@example.com'), []);
  assert.deepEqual(readDecisions({ getItem() { throw new Error('Storage disabled'); } }, 'a@example.com'), []);
});
