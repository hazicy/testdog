import { expect, it } from 'vitest';
import { parseDeviceRecordingScript, deviceRecordingScript } from './deviceRecording';
it('round-trips stable native actions and semantic expectations and refuses refs or platform changes', () => {
  const code = JSON.stringify({
    schemaVersion: 1,
    platform: 'android',
    steps: [
      {
        title: 'Fill',
        action: { type: 'fill', target: { kind: 'identifier', value: 'name' }, value: 'Ada' },
      },
      { title: 'Verify', assertion: { description: 'Welcome Ada' } },
    ],
  });
  const steps = parseDeviceRecordingScript(code, 'android');
  expect(parseDeviceRecordingScript(deviceRecordingScript('android', steps), 'android')).toEqual(
    steps,
  );
  expect(() => parseDeviceRecordingScript(code, 'ios')).toThrow('不兼容');
  expect(() =>
    parseDeviceRecordingScript(
      code.replace('"kind":"identifier","value":"name"', '"kind":"ref","value":"@e1","revision":1'),
      'android',
    ),
  ).toThrow('临时 ref');
});
it('round-trips deterministic checks and rejects missing expected values and cross-platform checks', () => {
  const recording = {
    schemaVersion: 1,
    platform: 'ios',
    steps: [
      {
        title: 'Welcome',
        check: {
          platform: 'ios',
          type: 'text',
          target: { kind: 'identifier', value: 'welcome' },
          value: 'Welcome Ada',
        },
      },
    ],
  };
  const steps = parseDeviceRecordingScript(JSON.stringify(recording), 'ios');
  expect(steps[0].platformAssertion).toEqual(recording.steps[0].check);
  expect(parseDeviceRecordingScript(deviceRecordingScript('ios', steps), 'ios')).toEqual(steps);
  expect(() =>
    parseDeviceRecordingScript(
      JSON.stringify({
        ...recording,
        steps: [
          { ...recording.steps[0], check: { ...recording.steps[0].check, value: undefined } },
        ],
      }),
      'ios',
    ),
  ).toThrow('expected value');
  expect(() =>
    parseDeviceRecordingScript(
      JSON.stringify({
        ...recording,
        steps: [
          { ...recording.steps[0], check: { ...recording.steps[0].check, platform: 'android' } },
        ],
      }),
      'ios',
    ),
  ).toThrow('不兼容');
});
