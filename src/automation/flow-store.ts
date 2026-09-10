import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FlowSchema, type Flow } from './compiler';
const directory = path.join(process.cwd(), '.automation', 'flows');
export async function saveFlow(flow: Flow) {
  FlowSchema.parse(flow);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(directory, `${flow.id}.json`),
    JSON.stringify(flow, null, 2),
    { flag: 'wx', mode: 0o600 },
  );
}
export async function loadFlow(id: string) {
  const safeId = FlowSchema.shape.id.parse(id);
  return FlowSchema.parse(
    JSON.parse(await readFile(path.join(directory, `${safeId}.json`), 'utf8')),
  );
}
export async function listFlows() {
  const files = await readdir(directory).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  );
  return Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (file) => {
        const flow = await loadFlow(file.slice(0, -5));
        return {
          id: flow.id,
          goal: flow.goal,
          createdAt: flow.createdAt,
          steps: flow.steps.length,
        };
      }),
  );
}
