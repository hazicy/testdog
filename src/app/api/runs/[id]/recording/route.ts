import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, validId } from '@/workspace/http';
import { listRecordingVersions, saveRecordingVersion } from '@/workspace/store';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    validId(id);
    return NextResponse.json({ versions: await listRecordingVersions(id) });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  const parsed = z
    .object({ code: z.string().min(1).max(100000) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: '请提供有效脚本（最多 100,000 字符）。' }, { status: 400 });
  try {
    const { id } = await context.params;
    validId(id);
    return NextResponse.json(
      { version: await saveRecordingVersion(id, parsed.data.code) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
