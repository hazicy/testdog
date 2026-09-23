type IntentNodeBase = {
  /** 与此节点关联的目标。 */
  goal: string;
  /** 约束的条件 */
  constraints?: string[];
  /** 成功的标准 */
  successCriteria?: string[];
};

/** 仍需细化的意图；必须拥有至少一个子意图。 */
export type CompoundIntentNode = IntentNodeBase & {
  status: 'compound';
  children: IntentNode[];
};

/** 可直接执行的意图；叶子节点不能继续拆分。 */
export type AtomicIntentNode = IntentNodeBase & {
  status: 'atomic';
  children?: never;
};

/** 表示意图层级结构中的一个节点。 */
export type IntentNode = CompoundIntentNode | AtomicIntentNode;

export interface Compiler {
  compile(goal: string, startUrl?: string): Promise<IntentNode>;
}
