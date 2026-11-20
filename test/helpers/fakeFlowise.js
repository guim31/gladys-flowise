// -----------------------------------------------------------------------------
// A fake Flowise server behind a fake `fetch`, built on the real answers
// recorded from flowiseai/flowise 3.1.2 (test/fixtures/flowise/): an
// agentflow "Echo" (Start → Direct Reply, no model) that answers
// "Echo: <question>". Tests change its fields to play an outage, a wrong key,
// a protected flow, a flow that fails…
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/flowise/${name}.json`, import.meta.url), 'utf8'));

export const ECHO_ID = fixture('chatflows')[0].id;

const json = (status, body) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' },
  });

export class FakeFlowise {
  constructor({ url = 'http://192.0.2.20:3000', apiKey = 'flowise-test-key' } = {}) {
    this.url = url;
    this.apiKey = apiKey;
    this.version = fixture('version').version;
    this.flows = fixture('chatflows');
    /** Flow ids that need the API key (Flowise "chatflow-level" key). */
    this.protected = new Set();
    /** Flow ids whose run fails in Flowise. */
    this.broken = new Set();
    /** false: connection refused; 'timeout': never answers. */
    this.online = true;
    /** What a flow answers: a function of the request body. */
    this.reply = (body) => {
      const answer = fixture('prediction');
      const sessionId = body.overrideConfig?.sessionId ?? answer.sessionId;
      return { ...answer, text: `Echo: ${body.question}`, question: body.question, sessionId };
    };
    this.requests = [];
    this.fetch = this.fetch.bind(this);
  }

  addFlow(name, id = crypto.randomUUID()) {
    this.flows.push({ ...this.flows[0], id, name });
    return id;
  }

  calls(path) {
    return this.requests.filter((request) => request.path === path).length;
  }

  async fetch(target, init = {}) {
    const url = new URL(target);
    const body = init.body ? JSON.parse(init.body) : undefined;
    this.requests.push({ method: init.method, path: url.pathname, body, headers: init.headers });
    if (!target.startsWith(this.url)) {
      throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
    }
    if (this.online === false) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (this.online === 'timeout') {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }
    const keyOk = init.headers?.authorization === `Bearer ${this.apiKey}`;
    const path = url.pathname.replace(new URL(this.url).pathname.replace(/\/$/, ''), '');
    if (init.method === 'GET' && path === '/api/v1/ping') {
      return json(200, 'pong');
    }
    if (init.method === 'GET' && path === '/api/v1/version') {
      return json(200, { version: this.version });
    }
    if (init.method === 'GET' && path === '/api/v1/chatflows') {
      return keyOk ? json(200, this.flows) : json(401, fixture('chatflows-unauthorized'));
    }
    const prediction = path.match(/^\/api\/v1\/prediction\/(.+)$/);
    if (init.method === 'POST' && prediction) {
      const id = decodeURIComponent(prediction[1]);
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return json(400, fixture('prediction-invalid-id'));
      }
      if (!this.flows.some((flow) => flow.id === id)) {
        return json(404, fixture('prediction-not-found'));
      }
      if (this.protected.has(id) && !keyOk) {
        return json(500, fixture('prediction-unauthorized'));
      }
      if (this.broken.has(id)) {
        return json(500, fixture('prediction-flow-error'));
      }
      return json(200, this.reply(body));
    }
    return json(404, { statusCode: 404, success: false, message: 'Not found' });
  }
}
