// -----------------------------------------------------------------------------
// The Flowise hub: the server is read on a timer of the container (the
// interval chosen in the configuration), its states published to Gladys when
// they change, the "offline" / "back" scene events fired on transitions; and
// the questions of the scene action.
//
// Gladys never polls the device (should_poll: false): the configurable
// interval goes up to 5 minutes, beyond the fixed list of the core scheduler,
// and the scene events must fire even when the device was not added.
// (Adapted from guim31/gladys-ollama.)
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { parseFlowId } from './config.js';
import { buildDevice, deviceIds, featureValues } from './devices.js';
import { ERROR_KINDS, FlowiseClient } from './flowise/client.js';
import {
  ACTION_TEXT,
  ActionFailure,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  everyLanguage,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'flowise-hub' });

export const WIDGET_KEY = 'flowise';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  OFFLINE: 'server_offline',
  BACK: 'server_back',
});

export const HUB_TIMINGS = {
  // A server that fails once is read again this soon, to tell a blip from an outage.
  retryMs: 15_000,
  // Failures in a row before the server counts as down (scene event).
  downAfterFailures: 2,
  // States that do not change are sent again this often, or Gladys shows
  // "no recent value" after 48 hours.
  heartbeatMs: 12 * 60 * 60_000,
};

// What the scene action hands over: Gladys caps an output at 10 000 characters.
export const MAX_ANSWER_CHARACTERS = 10_000;
export const DEFAULT_ANSWER_CHARACTERS = 1000;
export const MIN_ANSWER_CHARACTERS = 50;

// What Gladys grants the scene action (120 s), minus a margin for the answer.
export const ACTION_BUDGET_MS = 115_000;

// A conversation name typed in a scene becomes the Flowise sessionId.
export const MAX_SESSION_LENGTH = 100;

const DOWN_KINDS = new Set([ERROR_KINDS.UNREACHABLE, ERROR_KINDS.TIMEOUT]);

/**
 * Cut an answer to `max` characters, at the end of a sentence when one ends in
 * the last third, else at a word; `…` marks the cut.
 * @returns {{ text: string, truncated: boolean }}
 */
export function truncate(text, max) {
  if (text.length <= max) {
    return { text, truncated: false };
  }
  // Room for the " …" mark of a cut at the end of a sentence.
  const room = text.slice(0, max - 2);
  const sentence = Math.max(
    ...['. ', '! ', '? ', '.\n', '!\n', '?\n', '\n'].map((end) => room.lastIndexOf(end)),
  );
  if (sentence >= max * 0.66) {
    return { text: `${room.slice(0, sentence + 1).trimEnd()} …`, truncated: true };
  }
  const word = room.lastIndexOf(' ');
  const cut = word >= max * 0.66 ? room.slice(0, word) : room;
  return { text: `${cut.trimEnd()}…`, truncated: true };
}

/** A number of characters typed in a scene (a number, or a string). */
export function parseMaxCharacters(raw) {
  const number = typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim()) : raw;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    return DEFAULT_ANSWER_CHARACTERS;
  }
  return Math.min(MAX_ANSWER_CHARACTERS, Math.max(MIN_ANSWER_CHARACTERS, Math.round(number)));
}

/** The conversation typed in a scene, as a Flowise sessionId ('' for none). */
export function parseSession(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return '';
  }
  return String(raw).trim().slice(0, MAX_SESSION_LENGTH);
}

export class FlowiseHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {typeof fetch} [options.fetch] HTTP seam (tests)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, fetch, timers = true, timings, now }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.state = this.emptyState();
    // The last answer survives a change of address: it was said.
    this.lastAnswer = null;
    /** Last value published per feature external id. */
    this.published = new Map();
    this.heartbeatAt = 0;
    this.transport = null;
    this.connection = null;
    this.pollTimer = null;
    this.retryTimer = null;
    this.reading = null;
    this.stopped = false;
    /** Problems already logged as warnings, by key: repeats go to debug. */
    this.warned = new Set();
  }

  emptyState() {
    return {
      online: null,
      version: null,
      flows: null,
      keyError: null,
      error: null,
      failures: 0,
      down: false,
      downSince: null,
    };
  }

  /** The state the device features show: the server, and the last answer. */
  get view() {
    return { ...this.state, lastAnswer: this.lastAnswer };
  }

  get withKey() {
    return Boolean(this.config?.apiKey);
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (server connected, lost, back, user
  // commands). A problem that repeats every cycle is logged once at its own
  // level, then at debug until it clears. Never a question or an answer.

  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  resolved(key) {
    this.warned.delete(key);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transport = null;
    this.connection = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const changed = !previous || previous.url !== config.url || previous.apiKey !== config.apiKey;
    if (changed) {
      this.client = config.url
        ? new FlowiseClient({ url: config.url, apiKey: config.apiKey, fetch: this.fetch })
        : null;
      // Another server: forget what the previous one said, without events.
      this.state = this.emptyState();
      clearTimeout(this.retryTimer);
    }
    try {
      await this.publishDevices();
      await this.refresh();
    } finally {
      // A refused publication must not stop the readings for good.
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    clearTimeout(this.retryTimer);
    await this.reading?.catch(() => {});
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.refresh();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Reading failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  later(name, delay, run) {
    clearTimeout(this[name]);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    this[name] = setTimeout(() => {
      run().catch((err) => this.problem(name, 'Reading failed', err, 'error'));
    }, delay);
    this[name].unref?.();
  }

  // --- Device ----------------------------------------------------------------

  async publishDevices() {
    // An empty list when no address is set: the Discovery tab shows nothing stale.
    const devices = this.config.url
      ? [
          buildDevice(this.gladys, this.config.url, {
            language: this.config.language,
            withKey: this.withKey,
          }),
        ]
      : [];
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** "Search" in the Discovery tab: publish the device again, read the server. */
  async rediscover() {
    await this.publishDevices();
    await this.refresh();
  }

  /** The user added (or updated) the device: its states sent before were dropped. */
  async onDeviceCreated(device) {
    if (device.external_id !== deviceIds(this.gladys).device) {
      return;
    }
    await this.publishStates({ force: true });
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Reading the server ------------------------------------------------------

  /** Read the server and publish what changed. Concurrent calls share the read. */
  refresh() {
    if (!this.client) {
      return this.afterChanges(false);
    }
    // A read of a previous address is not shared: the new one is read now.
    if (this.reading?.client !== this.client) {
      const reading = this.read().finally(() => {
        if (this.reading === reading) {
          this.reading = null;
        }
      });
      reading.client = this.client;
      this.reading = reading;
    }
    return this.reading;
  }

  /** Gladys asks for a refresh (onPoll), a fallback: the timer does the work. */
  async pollDevice(device) {
    if (device.external_id === deviceIds(this.gladys).device) {
      await this.refresh();
    }
  }

  async read() {
    const client = this.client;
    let widgetChanged;
    try {
      await client.ping();
      const [version, list] = await Promise.all([client.version(), this.readFlows(client)]);
      if (client !== this.client) {
        return; // the address changed while reading
      }
      widgetChanged = await this.applySuccess({ version, ...list });
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      if (client !== this.client) {
        return;
      }
      widgetChanged = await this.applyFailure(err);
    }
    await this.afterChanges(widgetChanged);
  }

  /**
   * The flows, with a key. A key Flowise refuses on the list (wrong, or
   * without the "view" permission) does not make the server look down: it is
   * reported apart (`keyError`), the questions can still reach open flows.
   */
  async readFlows(client) {
    if (!this.withKey) {
      return { flows: null, keyError: null };
    }
    try {
      return { flows: await client.chatflows(), keyError: null };
    } catch (err) {
      if (DOWN_KINDS.has(err.kind) || !err.kind) {
        throw err;
      }
      return { flows: null, keyError: err };
    }
  }

  async applySuccess({ version, flows, keyError }) {
    const state = this.state;
    const names = (list) => (list ?? []).map((flow) => `${flow.id} ${flow.name}`).join('\n');
    const widgetChanged =
      state.online !== true ||
      state.error !== null ||
      state.version !== version ||
      names(state.flows) !== names(flows) ||
      state.keyError?.kind !== keyError?.kind;
    if (keyError && state.keyError?.kind !== keyError.kind) {
      logger.warn(`Flowise: ${keyError.message}`);
    }
    if (state.down) {
      const downMinutes = Math.round((this.now() - state.downSince) / 60_000);
      logger.info(`Flowise answers again after ${downMinutes} min`);
      await this.fire(TRIGGERS.BACK, { downtime_minutes: downMinutes });
    } else if (state.error) {
      logger.info('Flowise: connection restored');
    } else if (state.online === null) {
      const flowCount = flows ? `${flows.length} flow(s)` : 'no API key';
      logger.info(`Flowise ${version ?? '(version unknown)'} connected, ${flowCount}`);
    }
    clearTimeout(this.retryTimer);
    this.state = {
      online: true,
      version,
      flows,
      keyError: keyError ? { kind: keyError.kind, message: keyError.message } : null,
      error: null,
      failures: 0,
      down: false,
      downSince: null,
    };
    await this.publishStates();
    return widgetChanged;
  }

  async applyFailure(err) {
    const state = this.state;
    const wasError = state.error?.kind;
    state.error = { kind: err.kind, message: err.message };
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`Flowise: ${err.message}`);
    } else {
      logger.debug(`Flowise: ${err.message} (again)`);
    }
    // Only silence counts as down: a refused key or a wrong address is a
    // configuration problem, reported by the connection status.
    if (!DOWN_KINDS.has(err.kind)) {
      state.failures = 0;
      // Keeps the heartbeat of the last values going.
      await this.publishStates();
      return wasError !== err.kind;
    }
    state.failures += 1;
    if (state.failures === 1 && !state.down) {
      state.downSince = this.now();
      this.later('retryTimer', this.timings.retryMs, () => this.refresh());
    }
    if (!state.down && state.failures >= this.timings.downAfterFailures) {
      state.down = true;
      state.online = false;
      await this.fire(TRIGGERS.OFFLINE, {
        error: pick(ERROR_TEXT[err.kind], this.config.language),
      });
      await this.publishStates();
      return true;
    }
    await this.publishStates();
    return wasError !== err.kind;
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishStates({ force = false } = {}) {
    const heartbeat = this.now() - this.heartbeatAt >= this.timings.heartbeatMs;
    const states = [];
    for (const { externalId, value } of featureValues(this.gladys, this.view, this.withKey)) {
      if (value === null || (!force && !heartbeat && this.published.get(externalId) === value)) {
        continue;
      }
      states.push(
        typeof value === 'string'
          ? { device_feature_external_id: externalId, text: value }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
      for (const state of states) {
        this.published.set(state.device_feature_external_id, state.text ?? state.state);
      }
      if (heartbeat || force) {
        this.heartbeatAt = this.now();
      }
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged) {
    await this.publishTransport();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async publishTransport() {
    if (!this.client || this.state.online === null) {
      return;
    }
    const transport = this.state.down ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    if (this.transport === transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: deviceIds(this.gladys).device, transport },
      ]);
      this.transport = transport;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transport refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.urlTyped ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl,
      };
    }
    const { error, keyError } = this.state;
    // A single silent reading is a blip: red only once the server is down.
    if (error && (!DOWN_KINDS.has(error.kind) || this.state.down)) {
      return { connected: false, message: ERROR_TEXT[error.kind] };
    }
    if (keyError) {
      return { connected: false, message: ERROR_TEXT[keyError.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Asking a flow ---------------------------------------------------------------------

  /** The client, or the reason there is none (shown in red). */
  requireClient() {
    if (!this.client) {
      throw new ActionFailure(this.connectionStatus().message);
    }
    return this.client;
  }

  /** An error of the client, as the user reads it. */
  userError(err) {
    if (!err.kind) {
      return err;
    }
    return new ActionFailure(ERROR_TEXT[err.kind], { cause: err });
  }

  /**
   * The flow a question goes to: the one typed (id, address copied from
   * Flowise, or name), else the default of the configuration, else the only
   * flow of the instance.
   * @returns {Promise<{ id: string, name: string|null }>}
   */
  async flowOf(typed) {
    const text = (typeof typed === 'string' ? typed.trim() : '') || this.config.defaultFlow;
    const known = (id) => this.state.flows?.find((flow) => flow.id.toLowerCase() === id) ?? null;
    if (!text) {
      if (this.state.flows?.length === 1) {
        return { id: this.state.flows[0].id, name: this.state.flows[0].name };
      }
      throw new ActionFailure(ACTION_TEXT.noFlow);
    }
    const id = parseFlowId(text);
    if (id) {
      return { id: known(id)?.id ?? id, name: known(id)?.name ?? null };
    }
    if (!this.withKey) {
      throw new ActionFailure(ACTION_TEXT.nameNeedsKey);
    }
    // A name: the list read now, a flow created since the last reading included.
    let flows;
    try {
      flows = await this.client.chatflows();
    } catch (err) {
      throw this.userError(err);
    }
    const wanted = text.toLocaleLowerCase();
    const matches = flows.filter((flow) => flow.name.trim().toLocaleLowerCase() === wanted);
    if (matches.length === 0) {
      throw new ActionFailure(ACTION_TEXT.unknownName);
    }
    if (matches.length > 1) {
      throw new ActionFailure(ACTION_TEXT.ambiguousName);
    }
    return { id: matches[0].id, name: matches[0].name };
  }

  /**
   * Ask a flow one question.
   * @param {object} request
   * @param {string} request.question
   * @param {string} [request.flow] id, address or name of the flow
   * @param {string} [request.session] conversation to continue
   * @param {number|string} [request.maxCharacters]
   * @returns {Promise<{ response: string, flow: string, session_id: string, duration_seconds: number, truncated: boolean }>}
   */
  async ask({ question: typedQuestion, flow: typedFlow, session, maxCharacters }) {
    const client = this.requireClient();
    const question = typeof typedQuestion === 'string' ? typedQuestion.trim() : '';
    if (!question) {
      throw new ActionFailure(ACTION_TEXT.noQuestion);
    }
    const asked = this.now();
    const flow = await this.flowOf(typedFlow);
    const label = flow.name ?? flow.id;
    const sessionId = parseSession(session);
    const max = parseMaxCharacters(maxCharacters);
    const started = this.now();
    let answer;
    try {
      answer = await client.predict({
        flowId: flow.id,
        question,
        sessionId: sessionId || undefined,
        // Gladys grants the action 120 s: a name looked up first shortens the wait.
        timeoutMs: Math.max(
          5_000,
          Math.min(this.config.timeoutMs, ACTION_BUDGET_MS - (this.now() - asked)),
        ),
      });
    } catch (err) {
      logger.warn(`Question to the flow ${label} failed: ${err.message}`);
      throw this.userError(err);
    }
    const text = answer.text.trim();
    if (!text) {
      logger.warn(`Question to the flow ${label}: empty answer`);
      throw new ActionFailure(ACTION_TEXT.emptyAnswer);
    }
    const { text: response, truncated } = truncate(text, max);
    const seconds = Math.round((this.now() - started) / 100) / 10;
    // Lengths only: the question and the answer stay out of the logs.
    logger.info(
      `Flow ${label} answered in ${seconds} s (${response.length} characters${truncated ? ', cut' : ''})`,
    );
    this.lastAnswer = { text: response, flow: label, at: this.now() };
    await this.publishStates();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
    return {
      response,
      flow: label,
      session_id: answer.sessionId ?? sessionId,
      duration_seconds: seconds,
      truncated,
    };
  }

  /** "Test the connection": read the server now, one line (red on failure). */
  async testConnection() {
    await this.refresh();
    if (!this.client) {
      throw new ActionFailure(this.connectionStatus().message);
    }
    if (this.state.error) {
      throw new ActionFailure(
        everyLanguage((language) =>
          labelled('Flowise', pick(ERROR_TEXT[this.state.error.kind], language), language),
        ),
      );
    }
    if (this.state.keyError) {
      throw new ActionFailure(
        everyLanguage((language) =>
          labelled('Flowise', pick(ERROR_TEXT[this.state.keyError.kind], language), language),
        ),
      );
    }
    return everyLanguage((language) => {
      const text = REPORT_TEXT[language];
      const ok = text.ok(this.state.version);
      if (!this.state.flows) {
        return `${ok} ${text.noKey}`;
      }
      if (this.state.flows.length === 0) {
        return `${ok} ${text.none}`;
      }
      const names = this.state.flows.map((flow) => flow.name);
      const list = names.length > 8 ? `${names.slice(0, 8).join(', ')}…` : names.join(', ');
      return `${ok} ${labelled(text.flows(names.length), list, language)}`;
    });
  }
}
