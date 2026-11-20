// -----------------------------------------------------------------------------
// The hub against the fake Flowise: device and states, the offline / back
// events, the questions (success in green, every failure in red with its
// multi-language message), the connection status and "Test the connection".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS, LAST_ANSWER_MAX } from '../src/devices.js';
import { TRIGGERS, WIDGET_KEY, parseMaxCharacters, parseSession, truncate } from '../src/hub.js';
import { WIDGETS } from '../src/widgets.js';
import {
  ECHO_ID,
  FakeFlowise,
  KEY,
  createAll,
  createWorld,
  deviceId,
  featureId,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('publishes the server as one device, with its first states', async (t) => {
  const { gladys, fake } = await world(t);
  assert.equal(fake.discoveredDevices.length, 1);
  const [device] = fake.discoveredDevices;
  assert.equal(device.external_id, deviceId(gladys));
  assert.equal(device.should_poll, false);
  assert.deepEqual(device.params, [{ name: 'FLOWISE_URL', value: 'http://192.0.2.20:3000' }]);
  assert.deepEqual(
    device.features.map((f) => f.external_id),
    [FEATURE_KEYS.ONLINE, FEATURE_KEYS.FLOWS, FEATURE_KEYS.LAST_ANSWER].map((k) =>
      featureId(gladys, k),
    ),
  );
  assert.equal(fake.lastState(featureId(gladys, FEATURE_KEYS.ONLINE)), 1);
  assert.equal(fake.lastState(featureId(gladys, FEATURE_KEYS.FLOWS)), 1);
  assert.equal(fake.connectionStatus.connected, true);
});

test('without API key: no flow counter, the server still followed', async (t) => {
  const { gladys, fake, server } = await world(t, { config: { url: '192.0.2.20' } });
  const [device] = fake.discoveredDevices;
  assert.equal(device.features.length, 2);
  assert.ok(!device.features.some((f) => f.external_id === featureId(gladys, FEATURE_KEYS.FLOWS)));
  assert.equal(server.calls('/api/v1/chatflows'), 0);
  assert.equal(fake.connectionStatus.connected, true);
});

test('no address: no device, a status asking for it', async (t) => {
  const { fake } = await world(t, { config: { language: 'fr' } });
  assert.deepEqual(fake.discoveredDevices, []);
  assert.equal(fake.connectionStatus.connected, false);
  assert.match(JSON.stringify(fake.connectionStatus), /Saisissez l'adresse/);
  const ack = await fake.sceneAction('ask', { question: 'Bonjour', flow: ECHO_ID });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /Saisissez l'adresse/);
});

test('publishes only the changes, and everything again once the device is added', async (t) => {
  const w = await world(t);
  const count = () => w.fake.states.length;
  const before = count();
  await w.hub.refresh();
  assert.equal(count(), before, 'nothing changed, nothing sent');

  w.server.addFlow('Weather report');
  await w.hub.refresh();
  assert.equal(w.fake.lastState(featureId(w.gladys, FEATURE_KEYS.FLOWS)), 2);
  assert.equal(count(), before + 1);

  const refreshes = w.fake.widgetRefreshes.length;
  await createAll(w);
  assert.equal(count(), before + 3, 'the two states again');
  assert.equal(w.fake.widgetRefreshes.length, refreshes + 1);
});

test('sends the unchanged states again every 12 hours (heartbeat)', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  w.clock.advance(11 * 3600_000);
  await w.hub.refresh();
  assert.equal(w.fake.states.length, before);
  w.clock.advance(3600_000);
  await w.hub.refresh();
  assert.equal(w.fake.states.length, before + 2);
});

test('offline after two failed readings, back with the outage length', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', api_key: KEY, language: 'fr' } });
  const online = featureId(w.gladys, FEATURE_KEYS.ONLINE);
  w.server.online = false;
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 0, 'one failure is a blip');
  assert.equal(w.fake.lastState(online), 1);
  assert.equal(w.fake.connectionStatus.connected, true);

  w.clock.advance(15_000);
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 1);
  const [offline] = w.fake.sceneEvents;
  assert.equal(offline.key ?? offline.event_key, TRIGGERS.OFFLINE);
  assert.match(JSON.stringify(offline), /ne répond pas/);
  assert.equal(w.fake.lastState(online), 0);

  w.clock.advance(60_000);
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 1, 'one event per outage');

  w.server.online = true;
  w.clock.advance(5 * 60_000);
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 2);
  const back = w.fake.sceneEvents[1];
  assert.equal(back.key ?? back.event_key, TRIGGERS.BACK);
  assert.match(JSON.stringify(back), /"downtime_minutes":6/);
  assert.equal(w.fake.lastState(online), 1);
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('a refused key is a status, not an outage: the server stays online', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', api_key: 'wrong', language: 'en' } });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(JSON.stringify(w.fake.connectionStatus), /API key/);
  assert.equal(w.fake.lastState(featureId(w.gladys, FEATURE_KEYS.ONLINE)), 1);
  w.clock.advance(60_000);
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 0);
  // An open flow still answers by its id; a name needs the list.
  const ok = await w.fake.sceneAction('ask', { question: 'Bonjour', flow: ECHO_ID });
  assert.equal(ok.success, true);
  const byName = await w.fake.sceneAction('ask', { question: 'Bonjour', flow: 'Echo' });
  assert.equal(byName.success, false);
  assert.match(byName.error.en, /check the API key/);
  const report = await w.fake.action('test_connection', {});
  assert.equal(report.success, false);
  await w.fake.configUpdated({ url: '192.0.2.20', api_key: KEY, language: 'en' });
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('a single silent reading does not turn the status red', async (t) => {
  const w = await world(t);
  w.server.online = false;
  await w.hub.refresh();
  assert.equal(w.fake.connectionStatus.connected, true, 'a blip');
  w.server.online = true;
  await w.hub.refresh();
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('the outage length counts from the first silence, a refused request in between', async (t) => {
  const w = await world(t);
  w.server.online = false;
  await w.hub.refresh();
  w.clock.advance(15_000);
  await w.hub.refresh();
  assert.equal(w.hub.state.down, true);
  // A proxy answering an error page while Flowise restarts, then silence again.
  w.clock.advance(60_000);
  await w.hub.applyFailure(Object.assign(new Error('HTTP 500'), { kind: 'http' }));
  w.clock.advance(60_000);
  await w.hub.refresh();
  w.server.online = true;
  w.clock.advance(60_000);
  await w.hub.refresh();
  const back = w.fake.sceneEvents.at(-1);
  assert.equal(back.key ?? back.event_key, TRIGGERS.BACK);
  assert.match(JSON.stringify(back), /"downtime_minutes":3/);
});

test('a refused publication at start does not stop the readings', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({ connect: false, timers: true });
  t.after(() => w.app.stop());
  const original = w.gladys.publishDiscoveredDevices.bind(w.gladys);
  let refuse = true;
  w.gladys.publishDiscoveredDevices = async (devices) => {
    if (refuse) {
      refuse = false;
      throw new Error('HTTP 500');
    }
    return original(devices);
  };
  await w.gladys.connect();
  await w.app.ready;
  const pings = w.server.calls('/api/v1/ping');
  t.mock.timers.tick(60_000);
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(w.server.calls('/api/v1/ping') > pings, 'the timer reads the server');
});

test('ask: the answer goes to the scene, and to the "last answer" feature', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', api_key: KEY } });
  await createAll(w);
  const ack = await w.fake.sceneAction('ask', {
    question: 'Quelle température dans le salon ? 21 °C',
    conversation: 'salon',
  });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  assert.deepEqual(ack.data.outputs, {
    response: 'Echo: Quelle température dans le salon ? 21 °C',
    flow: 'Echo',
    session_id: 'salon',
    duration_seconds: 0,
    truncated: false,
  });
  const request = w.server.requests.find((r) => r.path.startsWith('/api/v1/prediction/'));
  assert.equal(request.path, `/api/v1/prediction/${ECHO_ID}`, 'the only flow is used');
  assert.deepEqual(request.body.overrideConfig, { sessionId: 'salon' });
  assert.equal(
    w.fake.lastState(featureId(w.gladys, FEATURE_KEYS.LAST_ANSWER)),
    'Echo: Quelle température dans le salon ? 21 °C',
  );
});

test('ask: a flow by its id, its address or its name; the default one', async (t) => {
  const server = new FakeFlowise();
  const other = server.addFlow('Weather report');
  const w = await world(t, { server, config: { url: '192.0.2.20', api_key: KEY } });
  const lastPath = () =>
    server.requests.filter((r) => r.path.startsWith('/api/v1/prediction/')).at(-1).path;
  const ask = (fields) => w.fake.sceneAction('ask', { question: 'Bonjour', ...fields });
  assert.equal((await ask({ flow: ' weather REPORT ' })).data.outputs.flow, 'Weather report');
  assert.equal(lastPath(), `/api/v1/prediction/${other}`);
  await ask({ flow: `http://192.0.2.20:3000/v2/agentcanvas/${ECHO_ID}` });
  assert.equal(lastPath(), `/api/v1/prediction/${ECHO_ID}`);
  await w.fake.configUpdated({ url: '192.0.2.20', api_key: KEY, default_flow: other });
  await ask({});
  assert.equal(lastPath(), `/api/v1/prediction/${other}`);
});

test('ask: every failure is red, with a message in four languages', async (t) => {
  const server = new FakeFlowise();
  server.addFlow('Twin');
  server.addFlow('Twin');
  const w = await world(t, { server, config: { url: '192.0.2.20', api_key: KEY } });
  const ask = (fields) => w.fake.sceneAction('ask', { question: 'Bonjour', ...fields });
  const cases = [
    [{ flow: ECHO_ID, question: '  ' }, /La question est vide/],
    [{}, /Quel flux/],
    [{ flow: 'Unknown' }, /Aucun flux de ce nom/],
    [{ flow: 'Twin' }, /Plusieurs flux portent ce nom/],
    [{ flow: crypto.randomUUID() }, /flux introuvable/],
  ];
  for (const [fields, expected] of cases) {
    const ack = await ask(fields);
    assert.equal(ack.success, false, JSON.stringify(fields));
    assert.match(ack.error.fr, expected);
    assert.deepEqual(Object.keys(ack.error).sort(), ['de', 'en', 'es', 'fr']);
  }
  server.broken.add(ECHO_ID);
  let ack = await ask({ flow: ECHO_ID });
  assert.match(ack.error.fr, /le flux a échoué/);
  server.broken.clear();
  server.reply = () => ({ text: '   ' });
  ack = await ask({ flow: ECHO_ID });
  assert.match(ack.error.fr, /réponse vide/);
  server.online = false;
  ack = await ask({ flow: ECHO_ID });
  assert.match(ack.error.fr, /Flowise ne répond pas/);
});

test('ask: a flow protected by a key; a name without key', async (t) => {
  const server = new FakeFlowise();
  server.protected.add(ECHO_ID);
  const w = await world(t, { server, config: { url: '192.0.2.20', language: 'fr' } });
  let ack = await w.fake.sceneAction('ask', { question: 'Bonjour', flow: ECHO_ID });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /vérifiez la clé/);
  ack = await w.fake.sceneAction('ask', { question: 'Bonjour', flow: 'Echo' });
  assert.match(ack.error.fr, /demande la clé d'API/);
  await w.fake.configUpdated({ url: '192.0.2.20', api_key: KEY });
  ack = await w.fake.sceneAction('ask', { question: 'Bonjour', flow: ECHO_ID });
  assert.equal(ack.success, true);
});

test('ask: a long answer is cut cleanly; the device keeps its beginning', async (t) => {
  const server = new FakeFlowise();
  const long = 'Il fait beau. '.repeat(100) + 'Prenez un parapluie quand même.';
  server.reply = () => ({ text: long, sessionId: 'x' });
  const w = await world(t, { server });
  const ack = await w.fake.sceneAction('ask', { question: 'Météo ?', max_characters: '100' });
  const { response, truncated } = ack.data.outputs;
  assert.equal(truncated, true);
  assert.ok(response.length <= 100 && response.endsWith('…'), response);
  const full = await w.fake.sceneAction('ask', { question: 'Météo ?', max_characters: 5000 });
  assert.equal(full.data.outputs.truncated, false);
  const kept = w.fake.lastState(featureId(w.gladys, FEATURE_KEYS.LAST_ANSWER));
  assert.equal(kept.length, LAST_ANSWER_MAX);
});

test('the widget: server, flows, last answer (and the setting that hides it)', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', api_key: KEY, language: 'fr' } });
  let ack = await w.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'fr' });
  assert.equal(ack.success, true);
  let types = ack.data.content.components.map((c) => c.type);
  assert.deepEqual(types, ['value', 'status']);
  assert.match(JSON.stringify(ack.data.content), /Aucune question posée/);
  const refreshes = w.fake.widgetRefreshes.length;
  await w.fake.sceneAction('ask', { question: 'Bonjour' });
  assert.equal(w.fake.widgetRefreshes.length, refreshes + 1);
  ack = await w.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'fr' });
  types = ack.data.content.components.map((c) => c.type);
  assert.deepEqual(types, ['value', 'status', 'text']);
  assert.equal(ack.data.content.components[2].text, 'Echo: Bonjour');
  assert.match(JSON.stringify(ack.data.content.components[1]), /"10:15"|"\d\d:\d\d"/);
  const hidden = await WIDGETS[WIDGET_KEY].get(w.hub, {
    language: 'fr',
    settings: { show_answer: false },
  });
  assert.deepEqual(
    hidden.components.map((c) => c.type),
    ['value', 'status'],
  );
});

test('test the connection: green with the flows, red when refused', async (t) => {
  const w = await world(t, { config: { url: '192.0.2.20', api_key: KEY } });
  let ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.match(JSON.stringify(ack.data), /Flowise 3\.1\.2 répond\. 1 flux : Echo/);
  w.server.online = false;
  ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /Flowise : Flowise ne répond pas/);
});

test('parsers: length, conversation, cut', () => {
  assert.equal(parseMaxCharacters(undefined), 1000);
  assert.equal(parseMaxCharacters('20'), 50);
  assert.equal(parseMaxCharacters(99999), 10000);
  assert.equal(parseSession(' kitchen '), 'kitchen');
  assert.equal(parseSession(undefined), '');
  assert.equal(parseSession('x'.repeat(300)).length, 100);
  assert.deepEqual(truncate('short', 10), { text: 'short', truncated: false });
});
