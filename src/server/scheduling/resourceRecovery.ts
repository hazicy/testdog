import { legacyWebTarget } from '@/automation/platform/target';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { createAgentDeviceClient } from 'agent-device';
import { launchWebBrowser } from '@/automation/platform/web/mobile';
import { recoverResource } from './scheduler';
import { getRun } from '@/server/runs/repository';

export function ownerProcessStopped(owner: string | null, hostId: string): boolean {
  if (!owner?.startsWith(`${hostId}:`)) return false;
  const remainder = owner.slice(hostId.length + 1);
  const match = /^(\d+):[0-9a-f-]{36}$/.exec(remainder);

  if (!match) return false;
  const pid = Number(match[1]);

  if (!Number.isSafeInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);

    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

export async function recoverLocalResource(id: string, hostId: string) {
  return recoverResource(id, hostId, async (resource) => {
    // Reject live PIDs, including PID reuse. Heartbeat expiry is never proof.
    if (
      resource.metadata?.ownerHostname !== hostname() ||
      !ownerProcessStopped(resource.owner, hostId) ||
      !resource.runId
    )
      return false;
    const run = await getRun(resource.runId);

    if (resource.platform === 'web') {
      // Web slots have isolated process-local browser contexts. A dead worker
      // cannot issue commands; prove a fresh browser can start and stop.
      const browser = await launchWebBrowser(
        run.targetSnapshot?.platform === 'web' ? run.targetSnapshot : legacyWebTarget(run.url),
      );

      try {
        const page = await browser.newPage();

        await page.setContent('<title>CaseForge recovery</title>');
        if ((await page.title()) !== 'CaseForge recovery') return false;
      } finally {
        await browser.close();
      }

      return true;
    }

    if (!resource.deviceId) return false;
    const selection =
      resource.platform === 'ios' ? { udid: resource.deviceId } : { serial: resource.deviceId };
    const oldSession = `${run.id}-${run.attempt}`;
    const oldClient = createAgentDeviceClient({ session: oldSession, responseLevel: 'full' });
    const before = await oldClient.devices.capabilities({
      platform: resource.platform,
      ...selection,
      signal: AbortSignal.timeout(15000),
    });

    if (before.device.claimedBy && before.device.claimedBy.session !== oldSession) return false;
    const sessions = await oldClient.sessions.list({ signal: AbortSignal.timeout(15000) });

    if (sessions.some((session) => session.name === oldSession || session.address === oldSession))
      await oldClient.sessions.close({ signal: AbortSignal.timeout(30000) });
    const client = createAgentDeviceClient({
      session: `recovery-${randomUUID()}`,
      responseLevel: 'full',
    });
    const directory = await mkdtemp(join(tmpdir(), 'caseforge-recovery-'));

    try {
      await client.apps.open({
        platform: resource.platform,
        ...selection,
        noRecord: true,
        signal: AbortSignal.timeout(90000),
      });
      const observation = await client.capture.snapshot({
        signal: AbortSignal.timeout(90000),
        timeoutMs: 90000,
      });

      if (!observation.nodes.length) return false;
      const path = join(directory, 'health.png');

      await client.capture.screenshot({ path, signal: AbortSignal.timeout(15000) });
      const bytes = await readFile(path);

      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return false;
    } finally {
      try {
        await client.sessions.close({ signal: AbortSignal.timeout(30000) });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }

    const after = await client.devices.capabilities({
      platform: resource.platform,
      ...selection,
      signal: AbortSignal.timeout(15000),
    });

    return !after.device.claimedBy;
  });
}
