// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// The port of the official Docker image and of `npx flowise start`.
export const DEFAULT_PORT = 3000;

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

// Longest wait for an answer, in seconds. The scene action is granted 120 s
// by Gladys (connection wait included): the longest choice leaves a margin.
export const TIMEOUTS = ['30', '60', '90', '110'];

export const DEFAULT_CONFIG = {
  url: '',
  api_key: '',
  default_flow: '',
  timeout: '60',
  poll_interval: '60',
  language: 'fr',
};

// Pages of the Flowise interface and API roots: a URL copied from the browser
// points at one of them, the instance lives at the root.
const INTERFACE_PATH =
  /\/(api\/v1|canvas|v2\/agentcanvas|agentcanvas|chatflows|agentflows|chatbot|apikey|credentials|variables|tools|assistants|marketplaces|document-stores|executions|settings|login|signin|register)(\/.*)?$/i;

// Flowise ids are UUIDs.
export const FLOW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The chatflow id in what the user typed: an id, or the address of the
 * canvas or of the embedded chat copied from the browser. null otherwise (a
 * name, looked up in the list of chatflows).
 * @param {unknown} raw
 */
export function parseFlowId(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (FLOW_ID.test(text)) {
    return text.toLowerCase();
  }
  const match = text.match(
    /\/(?:canvas|agentcanvas|chatbot|prediction)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i,
  );
  return match ? match[1].toLowerCase() : null;
}

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10`, port 3000 added), `host:port`, or a URL copied from the
 * browser (`https://flowise.example.org/chatflows`, the page dropped, a
 * reverse proxy path kept).
 * @param {unknown} raw
 * @returns {string|null} base URL without trailing slash, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const typedScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(typedScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  // `url.port` is empty for a default port typed on purpose (`host:80`).
  const typedPort = /^[^/?#]*:\d+(?:[/?#]|$)/.test(
    typedScheme ? text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') : text,
  );
  if (!typedScheme && !url.port && !typedPort) {
    url.port = String(DEFAULT_PORT);
  }
  const path = url.pathname.replace(/\/+$/, '').replace(INTERFACE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const typed = text('url');
  return {
    url: parseServerUrl(typed),
    urlTyped: typed !== '',
    apiKey: text('api_key'),
    defaultFlow: text('default_flow'),
    timeoutMs: Number(pick('timeout', TIMEOUTS)) * 1000,
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
