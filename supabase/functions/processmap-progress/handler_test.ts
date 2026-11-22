import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'npm:jose@6.2.18';
import { authenticateOAuth } from './auth.ts';
import { createHandler, ISSUER, READER_ROLE, RESOURCE, RESOURCE_METADATA } from './handler.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const CLIENT = '00000000-0000-4000-8000-000000000003';
const SESSION = '00000000-0000-4000-8000-000000000004';
const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
const keys = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });

function sign(fields = {}) {
  return new SignJWT({
    role: READER_ROLE, client_id: CLIENT, session_id: SESSION,
    iss: ISSUER, aud: RESOURCE, sub: USER, iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600,
    ...fields,
  }).setProtectedHeader({ alg: 'ES256' }).sign(privateKey);
}

function post(method: string, params: unknown, token?: string) {
  return new Request(RESOURCE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

Deno.test('OAuth resource discovery and invalid credentials do not read a document', async () => {
  const handle = createHandler({
    authenticate: authenticateOAuth(keys, () => Promise.resolve(USER)),
    read: () => { throw new Error('Must not read a document'); },
  });
  const metadata = await handle(new Request(RESOURCE_METADATA));
  assert.equal((await metadata.json()).resource, RESOURCE);
  assert.equal(metadata.headers.get('Cache-Control'), 'no-store');

  const wrongTokens = [
    undefined,
    'not-a-token',
    await sign({ aud: 'authenticated', role: 'authenticated', client_id: undefined }),
    await sign({ aud: [RESOURCE, 'authenticated'] }),
    await sign({ role: 'authenticated' }),
    await sign({ iss: 'https://different-project.invalid/auth/v1' }),
    await sign({ exp: Math.floor(Date.now() / 1000) - 1 }),
    await sign({ is_anonymous: true }),
    await sign({ sub: OTHER }),
  ];
  for (const token of wrongTokens) {
    const response = await handle(post('tools/list', {}, token));
    assert.equal(response.status, 401);
    assert.ok(response.headers.get('WWW-Authenticate')?.includes(RESOURCE_METADATA));
  }
  const revoked = createHandler({
    authenticate: authenticateOAuth(keys, () => Promise.resolve(null)),
    read: () => { throw new Error('Revoked sessions must not read'); },
  });
  assert.equal((await revoked(post('tools/list', {}, await sign()))).status, 401);
  assert.equal((await handle(new Request(RESOURCE, { headers: { Origin: 'https://other.invalid' } }))).status, 403);
});

Deno.test('MCP exposes only read tools and projects the authenticated account’s progress', async () => {
  const reads: string[] = [];
  const handle = createHandler({
    authenticate: authenticateOAuth(keys, () => Promise.resolve(USER)),
    read: user => {
      reads.push(user);
      return Promise.resolve({
        updated_at: '2026-11-23T05:00:00Z',
        revision: 7,
        document: {
          activeSheetId: 'a',
          stages: [{ id: 's1', title: '制作', due: '2026-12-01', note: 'DO NOT SHARE', tasks: [
            { id: 't1', text: '完了', done: true, doneAt: '2026-11-22' },
            { id: 't2', text: '残り', star: true },
          ] }],
          sheets: [
            { id: 'a', name: '工程表', goal: { deadline: '2026-12-01' }, stages: [], inbox: ['DO NOT SHARE'] },
            { id: 'map', name: 'DO NOT SHARE', mindMap: {}, stages: [] },
          ],
          processedKeys: ['DO NOT SHARE'],
        },
      });
    },
  });
  const token = await sign();
  async function call(method: string, params: unknown) {
    const res = await handle(post(method, params, token));
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.status, 200);
    return await res.json();
  }
  const init = await call('initialize', {
    protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' },
  });
  assert.equal(init.result.serverInfo.name, 'ProcessMap Progress');
  const list = await call('tools/list', {});
  assert.deepEqual(list.result.tools.map((tool: { name: string }) => tool.name), [
    'list_schedules', 'get_schedule_progress',
  ]);
  assert.ok(list.result.tools.every((tool: { annotations: { readOnlyHint: boolean } }) => tool.annotations.readOnlyHint));
  const sheets = await call('tools/call', { name: 'list_schedules', arguments: {} });
  assert.deepEqual(sheets.result.structuredContent.sheets, [{ id: 'a', name: '工程表' }]);
  const progress = await call('tools/call', {
    name: 'get_schedule_progress', arguments: { sheetId: 'a', limit: 2 },
  });
  const snapshot = progress.result.structuredContent;
  assert.equal(snapshot.revision, 7);
  assert.equal(snapshot.tasks[1].due, '2026-12-01');
  assert.deepEqual(snapshot.summary, { completed: 1, remaining: 1, requiredRemaining: 1 });
  assert.equal(snapshot.nextOffset, 2);
  assert.ok(!JSON.stringify(progress).includes('DO NOT SHARE'));
  const unknown = await call('tools/call', {
    name: 'get_schedule_progress', arguments: { sheetId: 'someone-else' },
  });
  assert.equal(unknown.result.isError, true);
  const override = await call('tools/call', {
    name: 'get_schedule_progress', arguments: { sheetId: 'a', userId: OTHER },
  });
  assert.equal(override.result.isError, true);
  assert.deepEqual(reads, [USER, USER, USER]);
});
