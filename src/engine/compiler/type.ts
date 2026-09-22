export type Intent = {
  type: 'navigate' | 'click' | 'fill' | 'press' | 'wait' | 'assert';
  instruction: string;
};

export interface Compiler {
  compile(goal: string, startUrl?: string): Promise<Intent[]>;
}
