import type { Compiler, Plan } from './type';

/** Placeholder for a Feishu-specific case compiler. */
export class FeishuCompiler implements Compiler {
  constructor() {}

  async compile(_goal: string, _startUrl?: string): Promise<Plan> {
    throw new Error('FeishuCompiler is not implemented');
  }
}
