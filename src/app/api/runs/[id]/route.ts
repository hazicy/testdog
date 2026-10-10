import { NextResponse } from 'next/server';
import { getRun, requestCancellation } from '@/workspace/store';
import { apiError, validId } from '@/workspace/http';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    validId(id);
    return NextResponse.json({ run: await getRun(id) });
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    validId(id);
    await requestCancellation(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
