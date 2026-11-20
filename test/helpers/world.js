// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys and a fake Flowise server, with
// the integration wired on top through registerHandlers. No timer runs unless
// `timers: true` (with node:test mock timers): the tests read the server with
// `world.hub.refresh()`.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { ECHO_ID, FakeFlowise, fixture } from './fakeFlowise.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL = 'http://192.0.2.20:3000';
export const KEY = 'flowise-test-key';

/** A manual clock. */
export function createClock(start = Date.parse('2026-11-20T09:15:00Z')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {FakeFlowise} [options.server]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  clock = createClock(),
  server = new FakeFlowise(),
  config = { url: '192.0.2.20', api_key: KEY, language: 'en' },
  devices = [],
  connect = true,
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: server.fetch,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server, app, hub: app.hub, clock };
}

export const deviceId = (gladys) => gladys.externalIds('server', 'flowise').device;
export const featureId = (gladys, key) => gladys.externalIds('server', 'flowise').feature(key);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { ECHO_ID, FakeFlowise, fixture };
