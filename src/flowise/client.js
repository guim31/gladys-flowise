// -----------------------------------------------------------------------------
// Flowise REST API client (https://docs.flowiseai.com/api-reference), on the
// global fetch.
//
// Read: GET /api/v1/ping (public, "pong"), GET /api/v1/version (public),
// GET /api/v1/chatflows (API key). Write: POST /api/v1/prediction/{id} with
// `streaming: false`, the question, and `overrideConfig.sessionId` to keep a
// conversation going.
//
// The key is sent as a Bearer token: Flowise asks for one on the management
// API, and on a prediction when the chatflow is protected by a key. Errors
// carry a `kind` (ERROR_KINDS) the rest of the code translates; their message
// never holds the question, the answer or the key.
// -----------------------------------------------------------------------------

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable',
  TIMEOUT: 'timeout',
  AUTH: 'auth',
  NOT_FLOWISE: 'not_flowise',
  FLOW_NOT_FOUND: 'flow_not_found',
  FLOW_FAILED: 'flow_failed',
  HTTP: 'http',
});

export class FlowiseError extends Error {
  constructor(kind, message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'FlowiseError';
    this.kind = kind;
    this.status = status;
  }
}

// Reads are small and quick: a server that takes longer is in trouble.
export const READ_TIMEOUT_MS = 10_000;

// What is kept of an error message of Flowise, in the logs only: it can quote
// a node of the flow, never the question (checked on Flowise 3).
const MAX_SERVER_ERROR = 160;

/** Flowise flow types the prediction API answers (the "assistants" too). */
export const FLOW_TYPES = ['CHATFLOW', 'AGENTFLOW', 'MULTIAGENT', 'ASSISTANT'];

export class FlowiseClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL (src/config.js parseServerUrl)
   * @param {string} [options.apiKey] Flowise API key
   * @param {typeof fetch} [options.fetch] HTTP seam (tests)
   */
  constructor({ url, apiKey = '', fetch: fetchImpl = globalThis.fetch }) {
    this.url = url;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  async call(method, path, { body, timeoutMs = READ_TIMEOUT_MS, label = path } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    let response;
    try {
      response = await this.fetch(`${this.url}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new FlowiseError(
          ERROR_KINDS.TIMEOUT,
          `${method} ${label}: no answer within ${timeoutMs / 1000} s`,
          { cause: err },
        );
      }
      // fetch refuses redirects (`redirect: 'error'`): a proxy sending HTTP
      // to HTTPS, or a login page, is a wrong address, not a server down.
      if (/redirect/i.test(String(err?.cause?.message ?? err?.message))) {
        throw new FlowiseError(ERROR_KINDS.NOT_FLOWISE, `${method} ${label}: redirected`, {
          cause: err,
        });
      }
      const code = err?.cause?.code ?? err?.code;
      throw new FlowiseError(
        ERROR_KINDS.UNREACHABLE,
        `${method} ${label}: ${code ?? err?.message ?? 'network error'}`,
        { cause: err },
      );
    }
    let text;
    try {
      text = await response.text();
    } catch (err) {
      const kind = err?.name === 'TimeoutError' ? ERROR_KINDS.TIMEOUT : ERROR_KINDS.UNREACHABLE;
      throw new FlowiseError(kind, `${method} ${label}: answer cut short`, { cause: err });
    }
    let data;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    const serverError =
      data && typeof data.message === 'string'
        ? data.message.replace(/\s+/g, ' ').slice(0, MAX_SERVER_ERROR)
        : null;
    if (response.status === 401 || response.status === 403) {
      throw new FlowiseError(ERROR_KINDS.AUTH, `${method} ${label}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    // A reverse proxy whose Flowise is stopped: the server is down.
    if ([502, 503, 504].includes(response.status)) {
      throw new FlowiseError(
        ERROR_KINDS.UNREACHABLE,
        `${method} ${label}: HTTP ${response.status}`,
        { status: response.status },
      );
    }
    if (!response.ok) {
      if (data === undefined) {
        throw new FlowiseError(
          ERROR_KINDS.NOT_FLOWISE,
          `${method} ${label}: HTTP ${response.status}, not a Flowise answer`,
          { status: response.status },
        );
      }
      throw new FlowiseError(
        ERROR_KINDS.HTTP,
        `${method} ${label}: HTTP ${response.status}${serverError ? ` ${serverError}` : ''}`,
        { status: response.status },
      );
    }
    return { data, text };
  }

  /** The server answers ("pong"), with no key. */
  async ping() {
    const { text } = await this.call('GET', '/api/v1/ping');
    if (text.trim() !== 'pong') {
      throw new FlowiseError(ERROR_KINDS.NOT_FLOWISE, 'GET /api/v1/ping: not a Flowise answer');
    }
  }

  /** @returns {Promise<string|null>} the server version, null when not told */
  async version() {
    try {
      const { data } = await this.call('GET', '/api/v1/version');
      return data && typeof data.version === 'string' ? data.version : null;
    } catch (err) {
      // Older servers, or a proxy that only lets the API through: optional.
      if (err.kind === ERROR_KINDS.HTTP || err.kind === ERROR_KINDS.NOT_FLOWISE) {
        return null;
      }
      throw err;
    }
  }

  /**
   * The flows of the instance (API key required).
   * @returns {Promise<Array<{ id: string, name: string, type: string, deployed: boolean }>>}
   */
  async chatflows() {
    const { data } = await this.call('GET', '/api/v1/chatflows');
    // Flowise 3 answers an array; a paginated answer carries `data`.
    const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
    if (!list) {
      throw new FlowiseError(ERROR_KINDS.NOT_FLOWISE, 'GET /api/v1/chatflows: no list');
    }
    return list
      .filter((flow) => flow && typeof flow.id === 'string' && typeof flow.name === 'string')
      .map((flow) => ({
        id: flow.id,
        name: flow.name,
        type: typeof flow.type === 'string' ? flow.type : 'CHATFLOW',
        deployed: flow.deployed === true,
      }));
  }

  /**
   * One question, one answer (`streaming: false`).
   * @param {object} request
   * @param {string} request.flowId
   * @param {string} request.question
   * @param {string} [request.sessionId] keeps the conversation of a previous call
   * @param {object} [request.vars] Flowise variables (`$vars.<name>` in the flow)
   * @param {number} request.timeoutMs
   * @returns {Promise<{ text: string, sessionId: string|null }>}
   */
  async predict({ flowId, question, sessionId, vars, timeoutMs }) {
    const overrideConfig = {};
    if (sessionId) {
      overrideConfig.sessionId = sessionId;
    }
    if (vars && Object.keys(vars).length > 0) {
      overrideConfig.vars = vars;
    }
    const body = { question, streaming: false };
    if (Object.keys(overrideConfig).length > 0) {
      body.overrideConfig = overrideConfig;
    }
    const label = '/api/v1/prediction/…';
    let data;
    try {
      ({ data } = await this.call('POST', `/api/v1/prediction/${encodeURIComponent(flowId)}`, {
        body,
        timeoutMs,
        label,
      }));
    } catch (err) {
      // 404 "Chatflow … not found", 400 "Invalid Chatflow ID" (checked on 3.1).
      if (err.kind === ERROR_KINDS.HTTP && (err.status === 404 || err.status === 400)) {
        throw new FlowiseError(ERROR_KINDS.FLOW_NOT_FOUND, err.message, { status: err.status });
      }
      // A flow protected by a key, asked without it or with another one:
      // Flowise 3.1 answers 500 "predictionsServices.buildChatflow - Unauthorized".
      if (err.kind === ERROR_KINDS.HTTP && /unauthori[sz]ed\s*$/i.test(err.message)) {
        throw new FlowiseError(ERROR_KINDS.AUTH, err.message, { status: err.status });
      }
      // A node of the flow failed (a model unreachable, a tool error…).
      if (err.kind === ERROR_KINDS.HTTP && err.status >= 500) {
        throw new FlowiseError(ERROR_KINDS.FLOW_FAILED, err.message, { status: err.status });
      }
      throw err;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new FlowiseError(ERROR_KINDS.NOT_FLOWISE, `POST ${label}: not a Flowise answer`);
    }
    // A flow ending on a JSON output (structured output parser) answers `json`.
    let text = typeof data.text === 'string' ? data.text : null;
    if (text === null && data.json !== undefined) {
      text = JSON.stringify(data.json);
    }
    if (text === null) {
      throw new FlowiseError(ERROR_KINDS.NOT_FLOWISE, `POST ${label}: no text in the answer`);
    }
    return {
      text,
      sessionId:
        typeof data.sessionId === 'string'
          ? data.sessionId
          : typeof data.chatId === 'string'
            ? data.chatId
            : null,
    };
  }
}
