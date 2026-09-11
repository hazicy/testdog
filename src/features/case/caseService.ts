export type FlowSummary = {
  id: string;
  goal: string;
  createdAt: string;
  steps: number;
};

type ApiError = { success: false; message: string };

export type RecordResult = {
  success: true;
  mode: 'record';
  flowId: string;
  steps: number;
};

export type ReplayResult = {
  success: true;
  mode: 'replay';
  flowId: string;
  steps: number;
  url: string;
};

export type RunResult = RecordResult | ReplayResult;

async function parse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | ApiError | null;
  if (!response.ok || !payload || (payload as ApiError).success === false) {
    throw new Error(
      (payload as ApiError | null)?.message ?? `请求失败（${response.status}）`,
    );
  }
  return payload as T;
}

export async function listFlows(): Promise<FlowSummary[]> {
  const response = await fetch('/api/cases', { cache: 'no-store' });
  const { flows } = await parse<{ flows: FlowSummary[] }>(response);
  return flows.sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export async function recordCase(input: {
  case: string;
  url?: string;
}): Promise<RecordResult> {
  const response = await fetch('/api/cases', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'record',
      case: input.case,
      ...(input.url ? { url: input.url } : {}),
    }),
  });
  return parse<RecordResult>(response);
}

export async function replayFlow(flowId: string): Promise<ReplayResult> {
  const response = await fetch('/api/cases', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'replay', flowId }),
  });
  return parse<ReplayResult>(response);
}
