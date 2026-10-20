import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { getSuite, saveSuite, deleteSuite } from '@testdog/server/suites/repository';
import { apiError } from '@testdog/server/http/api';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    return NextResponse.json(
      await getSuite((await context.params).id, await requireUserId(request)),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const scope = await requireUserId(request);

    return NextResponse.json(
      await saveSuite((await context.params).id, await request.json().catch(() => null), scope),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await deleteSuite((await context.params).id, await requireUserId(request));

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
