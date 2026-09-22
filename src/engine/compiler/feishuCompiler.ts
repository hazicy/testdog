import type { Compiler, Intent } from './type';

/** Placeholder for a Feishu-specific case compiler. */
export class FeishuCompiler implements Compiler {
  async compile(_goal: string, _startUrl?: string): Promise<Intent[]> {
    throw new Error('FeishuCompiler is not implemented');
  }
}
