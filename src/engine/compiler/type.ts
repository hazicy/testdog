export type Assertion = {
  /** 用户明确要求验证的结果，不是为了完成操作而追加的动作。 */
  description: string;
};

export type PlanNode =
  | { kind: 'group'; id: string; goal: string; children: string[]; dependsOn: string[] }
  | {
      kind: 'task';
      id: string;
      goal: string;
      dependsOn: string[];
      requirementIds: string[];
      assertions: Assertion[];
    }
  | {
      kind: 'branch';
      id: string;
      condition: string;
      then: string;
      otherwise?: string;
      dependsOn: string[];
    };

export type Plan = {
  rootId: string;
  nodes: Record<string, PlanNode>;
};

export interface Compiler {
  compile(goal: string, startUrl?: string): Promise<Plan>;
}
