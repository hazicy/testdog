import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@testdog/server/shared/http';
import {
  readLoginIdentities,
  saveLoginIdentity,
} from '@testdog/server/login-identities/repository';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await readLoginIdentities(await requireUserId(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);

    return NextResponse.json(
      { identity: await saveLoginIdentity(await request.json().catch(() => null), userId) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
