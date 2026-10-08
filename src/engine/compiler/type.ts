export type Assertion = {
  /** 用户明确要求验证的结果，不是为了完成操作而追加的动作。 */
  description: string;
};

export type ActionStep = {
  id: string;
  type: 'action';
  goal: string;
  inputs: Record<string, string>;
};

export type GroupStep = {
  id: string;
  type: 'group';
  name: string;
  steps: TestStep[];
};

export type AssertStep = {
  id: string;
  type: 'assert';
  assertion: Assertion;
};

/** 数组顺序即执行顺序，group 仅用于组织步骤。 */
export type TestStep = ActionStep | GroupStep | AssertStep;

export type TestCase = {
  name: string;
  startUrl?: string;
  preconditions: string[];
  steps: TestStep[];
  assertions: Assertion[];
};

export interface Compiler {
  compile(goal: string, startUrl?: string): Promise<TestCase>;
}
