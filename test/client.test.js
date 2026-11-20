// -----------------------------------------------------------------------------
// The Flowise client against the fake server built on the real answers of
// Flowise 3.1.2: each HTTP answer becomes the right error kind.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_KINDS, FlowiseClient } from '../src/flowise/client.js';
import { ECHO_ID, FakeFlowise, KEY, URL, fixture } from './helpers/world.js';

const client = (server, apiKey = KEY) =>
  new FlowiseClient({ url: URL, apiKey, fetch: server.fetch });

const kindOf = (promise) =>
  promise.then(
    () => 'resolved',
    (err) => err.kind,
  );

test('ping, version and the list of flows', async () => {
  const server = new FakeFlowise();
  const flowise = client(server);
  await flowise.ping();
  assert.equal(await flowise.version(), '3.1.2');
  assert.deepEqual(await flowise.chatflows(), [
    { id: ECHO_ID, name: 'Echo', type: 'AGENTFLOW', deployed: false },
  ]);
  assert.equal(server.requests.at(-1).headers.authorization, `Bearer ${KEY}`);
});

test('a prediction sends the question and the conversation, without streaming', async () => {
  const server = new FakeFlowise();
  const answer = await client(server).predict({
    flowId: ECHO_ID,
    question: 'Bonjour',
    sessionId: 'kitchen',
    timeoutMs: 1000,
  });
  assert.deepEqual(answer, { text: 'Echo: Bonjour', sessionId: 'kitchen' });
  assert.deepEqual(server.requests.at(-1).body, {
    question: 'Bonjour',
    streaming: false,
    overrideConfig: { sessionId: 'kitchen' },
  });
  const fresh = await client(server, '').predict({
    flowId: ECHO_ID,
    question: 'Salut',
    timeoutMs: 1000,
  });
  assert.equal(fresh.sessionId, fixture('prediction').sessionId, 'the id Flowise answers');
  assert.deepEqual(server.requests.at(-1).body, { question: 'Salut', streaming: false });
  assert.equal(server.requests.at(-1).headers.authorization, undefined);
});

test('every failure has its kind', async () => {
  const server = new FakeFlowise();
  const ask = (flowise, flowId = ECHO_ID) =>
    kindOf(flowise.predict({ flowId, question: 'x', timeoutMs: 1000 }));
  assert.equal(await kindOf(client(server, 'wrong').chatflows()), ERROR_KINDS.AUTH);
  assert.equal(await ask(client(server), crypto.randomUUID()), ERROR_KINDS.FLOW_NOT_FOUND);
  assert.equal(await ask(client(server), 'not-an-id'), ERROR_KINDS.FLOW_NOT_FOUND);
  server.protected.add(ECHO_ID);
  assert.equal(await ask(client(server, '')), ERROR_KINDS.AUTH);
  assert.equal(await ask(client(server, 'wrong')), ERROR_KINDS.AUTH);
  assert.equal(await ask(client(server)), 'resolved');
  server.broken.add(ECHO_ID);
  assert.equal(await ask(client(server)), ERROR_KINDS.FLOW_FAILED);
  server.online = 'timeout';
  assert.equal(await ask(client(server)), ERROR_KINDS.TIMEOUT);
  server.online = false;
  assert.equal(await kindOf(client(server).ping()), ERROR_KINDS.UNREACHABLE);
  const elsewhere = new FlowiseClient({ url: 'http://192.0.2.99:3000', fetch: server.fetch });
  assert.equal(await kindOf(elsewhere.ping()), ERROR_KINDS.UNREACHABLE);
});

test('another server at the address is not taken for Flowise', async () => {
  const html = async () => new Response('<html>Login</html>', { status: 200 });
  const flowise = new FlowiseClient({ url: URL, fetch: html });
  assert.equal(await kindOf(flowise.ping()), ERROR_KINDS.NOT_FLOWISE);
  const missing = async () => new Response('Cannot GET', { status: 404 });
  assert.equal(
    await kindOf(new FlowiseClient({ url: URL, fetch: missing }).ping()),
    ERROR_KINDS.NOT_FLOWISE,
  );
  const proxyDown = async () => new Response('Bad gateway', { status: 502 });
  assert.equal(
    await kindOf(new FlowiseClient({ url: URL, fetch: proxyDown }).ping()),
    ERROR_KINDS.UNREACHABLE,
  );
});

test('the error messages never hold the key nor the question', async () => {
  const server = new FakeFlowise();
  server.broken.add(ECHO_ID);
  const err = await client(server, 'secret-key-42')
    .predict({ flowId: ECHO_ID, question: 'ma question privée', timeoutMs: 1000 })
    .catch((e) => e);
  assert.doesNotMatch(err.message, /secret-key-42|privée/);
  assert.match(err.message, /Start input type not found/);
});
