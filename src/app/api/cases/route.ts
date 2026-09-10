import { StagehandClient } from '@/automation/stagehand/client';
import { NextRequest, NextResponse } from 'next/server';
import dotenv from 'dotenv';
import { Executor } from '@/automation/executor';
import { Abilities } from '@/automation/abilities';
import { CaseCompiler } from '@/automation/compiler';

export async function GET(request: NextRequest) {
  return NextResponse.json({});
}

export async function POST(request: NextRequest) {
  dotenv.config();

  const { case: content, url } = await request.json();

  const client = await StagehandClient.create();
  const abilities = new Abilities(client!);
  const executor = new Executor(abilities);

  if (!client) {
    throw new Error('client 未初始化');
  }

  const page = await client?.createPage();

  try {
    await page?.goto(url, {
      waitUntil: 'domcontentloaded', // Don't wait for all resources
      timeout: 15000,
    });

    const compiler = new CaseCompiler();
    const cases = await compiler.compile(content);

    executor.execute(cases);

    await page?.close();

    await client?.dispose();

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);
    await client.dispose();

    return NextResponse.json({
      success: false,
      message: error,
    });
  }
}
