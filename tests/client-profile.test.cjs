const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAuthRoutes } = require('../routes/auth-routes.cjs');

function setup() {
  const routes = new Map();
  const app = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers.at(-1))]));
  const writes = [];
  registerAuthRoutes(app, {
    upload: { single: () => () => {}, fields: () => () => {} },
    User: { findOneAndUpdate(filter, update, options) {
      writes.push({ filter, update, options });
      return { select: async fields => ({ name: update.$set.name || 'Client', fields }) };
    } },
  });
  return { handler: routes.get('put /api/profile'), writes };
}
function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
test('client profile updates are scoped to the authenticated account and allowlisted', async () => {
  const { handler, writes } = setup();
  const res = response();
  await handler({ user: { role: 'client', email: 'CLIENT@example.com' }, body: { name: ' Alex ', location: ' Bengaluru ', email: 'victim@example.com', role: 'admin', password: 'replacement' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(writes[0].filter, { email: 'client@example.com', role: 'client' });
  assert.deepEqual(writes[0].update.$set, { name: 'Alex', location: 'Bengaluru' });
  assert.equal(res.body.user.fields, 'name email phone location focusArea');
});
test('client profile rejects blank names, objects, and oversized fields without writing', async () => {
  const { handler, writes } = setup();
  for (const body of [{ name: ' ' }, { location: { $gt: '' } }, { focusArea: 'x'.repeat(501) }]) {
    const res = response();
    await handler({ user: { role: 'client', email: 'client@example.com' }, body }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(writes.length, 0);
});
