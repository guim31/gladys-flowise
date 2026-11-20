import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseFlowId, parseServerUrl } from '../src/config.js';

const ID = 'b4aa0269-51dd-45e4-8121-569626ad0539';

test('parseServerUrl: bare host gets port 3000, a page of the interface is dropped', () => {
  assert.equal(parseServerUrl('192.0.2.20'), 'http://192.0.2.20:3000');
  assert.equal(parseServerUrl(' flowise.lan:8080 '), 'http://flowise.lan:8080');
  assert.equal(parseServerUrl('flowise.lan:80'), 'http://flowise.lan');
  assert.equal(parseServerUrl('http://192.0.2.20:3000/'), 'http://192.0.2.20:3000');
  assert.equal(parseServerUrl('http://192.0.2.20:3000/chatflows'), 'http://192.0.2.20:3000');
  assert.equal(
    parseServerUrl(`http://192.0.2.20:3000/v2/agentcanvas/${ID}`),
    'http://192.0.2.20:3000',
  );
  assert.equal(
    parseServerUrl(`https://ai.example.org/flowise/api/v1/prediction/${ID}`),
    'https://ai.example.org/flowise',
  );
  assert.equal(parseServerUrl('https://ai.example.org'), 'https://ai.example.org');
  assert.equal(parseServerUrl('http://user:pass@192.0.2.20'), null);
  assert.equal(parseServerUrl('ftp://192.0.2.20'), null);
  assert.equal(parseServerUrl(''), null);
  assert.equal(parseServerUrl(undefined), null);
});

test('parseFlowId: an id, or the address of a canvas, a chat or the API', () => {
  assert.equal(parseFlowId(ID), ID);
  assert.equal(parseFlowId(` ${ID.toUpperCase()} `), ID);
  assert.equal(parseFlowId(`http://192.0.2.20:3000/canvas/${ID}`), ID);
  assert.equal(parseFlowId(`http://192.0.2.20:3000/v2/agentcanvas/${ID}?x=1`), ID);
  assert.equal(parseFlowId(`http://192.0.2.20:3000/chatbot/${ID}`), ID);
  assert.equal(parseFlowId(`http://192.0.2.20:3000/api/v1/prediction/${ID}`), ID);
  assert.equal(parseFlowId('Home assistant'), null);
  assert.equal(parseFlowId(undefined), null);
});

test('normalizeConfig: defaults and choices', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    urlTyped: false,
    apiKey: '',
    defaultFlow: '',
    timeoutMs: 60_000,
    pollIntervalMs: 60_000,
    language: 'fr',
  });
  const config = normalizeConfig({
    url: 'not a url at all',
    api_key: ' key ',
    default_flow: ' Echo ',
    timeout: '110',
    poll_interval: '7',
    language: 'it',
  });
  assert.equal(config.url, null);
  assert.equal(config.urlTyped, true);
  assert.equal(config.apiKey, 'key');
  assert.equal(config.defaultFlow, 'Echo');
  assert.equal(config.timeoutMs, 110_000);
  assert.equal(config.pollIntervalMs, 60_000);
  assert.equal(config.language, 'fr');
});
