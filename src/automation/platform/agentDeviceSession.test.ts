import { describe, expect, it, vi } from 'vitest';
import type { AgentDeviceClient } from 'agent-device';
vi.mock('./builds', () => ({ installedBuildHash: vi.fn().mockResolvedValue('fixture-hash') }));
import { AgentDeviceSession } from './agentDeviceSession';
const target = {
  schemaVersion: 1,
  platform: 'ios',
  appId: 'com.example.app',
  deviceProfileId: 'fixture',
  resetPolicy: 'preserve',
} as const;
const signal = new AbortController().signal;
function client(
  nodes = [{ index: 0, ref: 'e1', role: 'button', identifier: 'submit', label: 'Submit' }],
) {
  return {
    devices: {
      capabilities: vi.fn().mockResolvedValue({
        device: { id: 'udid', osVersion: '27' },
        availableCommands: [
          'open',
          'close',
          'snapshot',
          'screenshot',
          'press',
          'fill',
          'swipe',
          'back',
        ],
      }),
    },
    apps: { open: vi.fn().mockResolvedValue({}) },
    capture: {
      snapshot: vi.fn().mockResolvedValue({ nodes, refsGeneration: 4 }),
      screenshot: vi.fn(),
    },
    interactions: { press: vi.fn().mockResolvedValue({}), fill: vi.fn().mockResolvedValue({}) },
    sessions: { close: vi.fn().mockResolvedValue({}) },
  };
}
describe('native session invariants', () => {
  it('invalidates refs after a device command fails because the UI may have changed', async () => {
    const sdk = client();
    const session = await AgentDeviceSession.open(
      'uncertain-run',
      target,
      'udid',
      signal,
      async () => {},
      sdk as unknown as AgentDeviceClient,
    );
    try {
      const observed = await session.observe(signal);
      const action = {
        platform: 'ios',
        action: { type: 'tap', target: { kind: 'ref', value: 'e1', revision: observed.revision } },
      } as const;
      sdk.interactions.press.mockRejectedValueOnce(new Error('Device disconnected'));
      await expect(session.perform(action, signal)).rejects.toThrow('disconnected');
      expect(session.latestObservation).toBeUndefined();
      await expect(session.perform(action, signal)).rejects.toThrow('Stale');
      expect(sdk.interactions.press).toHaveBeenCalledTimes(1);
    } finally {
      await session.close();
    }
  });
  it('fails a bounded wait when fresh snapshots never contain the expected text', async () => {
    const sdk = client();
    const session = await AgentDeviceSession.open(
      'wait-run',
      target,
      'udid',
      signal,
      async () => {},
      sdk as unknown as AgentDeviceClient,
    );
    try {
      await expect(
        session.perform(
          { platform: 'ios', action: { type: 'wait', text: 'Missing result', timeoutMs: 1000 } },
          signal,
        ),
      ).rejects.toThrow('timed out');
      expect(sdk.capture.snapshot).toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });
  it('binds a named session to its leased device, pins refs and rejects old refs after mutation', async () => {
    const sdk = client();
    const session = await AgentDeviceSession.open(
      'run-1',
      target,
      'udid',
      signal,
      async () => {},
      sdk as unknown as AgentDeviceClient,
    );
    expect(sdk.apps.open).toHaveBeenCalledWith(
      expect.objectContaining({ udid: 'udid', app: target.appId }),
    );
    const observed = await session.observe(signal);
    const action = {
      type: 'tap',
      target: { kind: 'ref', value: 'e1', revision: observed.revision },
    } as const;
    expect(session.binding(action)).toMatchObject({
      replayable: true,
      action: { target: { kind: 'identifier', value: 'submit' } },
    });
    await session.perform({ platform: 'ios', action }, signal);
    expect(sdk.interactions.press).toHaveBeenCalledWith(expect.objectContaining({ ref: '@e1~s4' }));
    await expect(session.perform({ platform: 'ios', action }, signal)).rejects.toThrow('Stale');
    await session.close();
    await session.close();
    expect(sdk.sessions.close).toHaveBeenCalledTimes(1);
  });
  it('fails on ambiguous stable locators and missing required capability', async () => {
    const sdk = client([
      { index: 0, ref: 'e1', role: 'button', identifier: 'submit', label: 'Submit' },
      { index: 1, ref: '@e2', role: 'button', identifier: 'submit', label: 'Submit' },
    ]);
    const session = await AgentDeviceSession.open(
      'run-2',
      target,
      'udid',
      signal,
      async () => {},
      sdk as unknown as AgentDeviceClient,
    );
    await session.observe(signal);
    await expect(
      session.perform(
        {
          platform: 'ios',
          action: { type: 'tap', target: { kind: 'identifier', value: 'submit' } },
        },
        signal,
      ),
    ).rejects.toThrow('found 2');
    sdk.devices.capabilities.mockResolvedValue({
      device: { id: 'udid', osVersion: '27' },
      availableCommands: ['open'],
    });
    await expect(
      AgentDeviceSession.open(
        'run-3',
        target,
        'udid',
        signal,
        async () => {},
        sdk as unknown as AgentDeviceClient,
      ),
    ).rejects.toThrow('snapshot');
    await session.close();
  });
});
it('closes the named SDK session when open partially succeeds then fails', async () => {
  const sdk = client();
  sdk.apps.open.mockRejectedValue(new Error('launch failed after claim'));
  await expect(
    AgentDeviceSession.open(
      'partial',
      target,
      'udid',
      signal,
      async () => {},
      sdk as unknown as AgentDeviceClient,
    ),
  ).rejects.toThrow('launch failed');
  expect(sdk.sessions.close).toHaveBeenCalledOnce();
});
it('refuses secret input in a nonsecure field before issuing SDK fill', async () => {
  vi.stubEnv('CASEFORGE_SECRET_PASSWORD', 'private-password');
  const sdk = client();
  try {
    const session = await AgentDeviceSession.open(
      'secure',
      { ...target, inputs: { password: { secretRef: 'PASSWORD' } } },
      'udid',
      signal,
      async () => {},
      sdk as unknown as AgentDeviceClient,
    );
    await session.observe(signal);
    await expect(
      session.perform(
        {
          platform: 'ios',
          action: {
            type: 'fill',
            target: { kind: 'identifier', value: 'submit' },
            value: '${secret:PASSWORD}',
          },
        },
        signal,
      ),
    ).rejects.toThrow('secure field');
    expect(sdk.interactions.fill).not.toHaveBeenCalled();
    await session.close();
  } finally {
    vi.unstubAllEnvs();
  }
});
it('rejects an incompatible OS before installing or opening the app', async () => {
  const sdk = client();
  await expect(
    AgentDeviceSession.open(
      'mismatch',
      target,
      'udid',
      signal,
      async () => {},
      sdk as unknown as AgentDeviceClient,
      { osVersion: '26', driverVersion: '0.21.24' },
    ),
  ).rejects.toThrow('不兼容');
  expect(sdk.apps.open).not.toHaveBeenCalled();
});
it('redacts reflected secrets and withholds a screenshot if the app shows them in a visible field', async () => {
  vi.stubEnv('CASEFORGE_SECRET_PASSWORD', 'private-password');
  const sdk = client([
    { index: 0, ref: 'e1', role: 'text', identifier: 'leak', label: 'private-password' },
  ]);
  try {
    const session = await AgentDeviceSession.open(
      'secret-screen',
      { ...target, inputs: { password: { secretRef: 'PASSWORD' } } },
      'udid',
      signal,
      async () => {},
      sdk as unknown as AgentDeviceClient,
    );
    expect(JSON.stringify(await session.observe(signal))).not.toContain('private-password');
    await expect(session.screenshot('/unused.png', signal)).rejects.toThrow('screenshot withheld');
    expect(sdk.capture.screenshot).not.toHaveBeenCalled();
    await session.close();
  } finally {
    vi.unstubAllEnvs();
  }
});
