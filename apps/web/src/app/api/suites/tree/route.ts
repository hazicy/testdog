import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { getSuiteTree } from '@testdog/server/suites/repository';
import { apiError } from '@testdog/server/shared/http';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await getSuiteTree(await requireUserId(request)));
  } catch (error) {
    return apiError(error);
  }
}
