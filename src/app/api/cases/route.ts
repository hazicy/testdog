import { StagehandClient } from '@/automation/stagehand/client';
import { NextRequest, NextResponse } from 'next/server';
import { Executor } from '@/automation/executor';
import { Abilities } from '@/automation/abilities';
import { RollingCaseCompiler } from '@/automation/compiler';

export async function GET(request: NextRequest) {
  return NextResponse.json({});
}

export async function POST(request: NextRequest) {
  const { case: content, url } = await request.json();
  let client: StagehandClient | undefined;
  let page: Awaited<ReturnType<StagehandClient['createPage']>> | undefined;

  try {
    client = await StagehandClient.create();
    if (!client) {
      throw new Error('浏览器客户端未初始化');
    }

    const abilities = new Abilities(client);
    const executor = new Executor(abilities);
    page = await client.createPage();

    if (typeof url === 'string' && url.length > 0) {
      await abilities.navigate(url, { page });
    }

    const compiler = new RollingCaseCompiler();
    const result = await executor.executeRolling(content, page, compiler);

    return NextResponse.json({
      success: true,
      steps: result.completedSteps.length,
      reason: result.reason,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    await page?.close().catch(() => undefined);
    await client?.dispose().catch(() => undefined);
  }
}
