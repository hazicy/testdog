import type { Compiler, IntentNode } from './type';

/** Placeholder for a Feishu-specific case compiler. */
export class FeishuCompiler implements Compiler {
  constructor() {}

  async compile(_goal: string, _startUrl?: string): Promise<IntentNode> {
    throw new Error('FeishuCompiler is not implemented');
  }
}
