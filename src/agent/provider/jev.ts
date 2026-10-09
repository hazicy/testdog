import { choice, TypeSafeClient } from '@typesafe-ai/sdk';

type AriaNode = {
  role: string;
  name?: string;
  text?: string;
  ref?: string;
  cursor?: string;
  disabled?: boolean;
  children?: AriaNode[];
};

const CLICKABLE_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'option',
  'radio',
  'tab',
  'checkbox',
  'switch',
]);

export type ClickDecision = { type: 'click'; ref: string };
export type NavigateDecision = { type: 'navigate'; url: string };
export type NavigateCandidate = { url: string; label: string };

function collectClickCandidates(nodes: AriaNode[], candidates: Record<string, string> = {}) {
  for (const node of nodes) {
    const isClickable =
      Boolean(node.ref) &&
      !node.disabled &&
      (node.cursor === 'pointer' || CLICKABLE_ROLES.has(node.role));

    if (isClickable && node.ref) {
      const label = node.name ?? node.text ?? '(无可访问名称)';
      candidates[node.ref] = `${node.role}: ${label}`;
    }

    if (node.children) collectClickCandidates(node.children, candidates);
  }

  return candidates;
}

/** 只负责浏览器原子动作的决策，绝不直接操作 Playwright。 */
export class Jev {
  private client = new TypeSafeClient();

  /** 在本轮 AI ARIA 快照的候选元素中决定点击目标。 */
  async decideClick(input: {
    goal: string;
    tree: AriaNode[];
    steps?: readonly object[];
  }): Promise<ClickDecision> {
    const candidates = collectClickCandidates(input.tree);
    const refs = Object.keys(candidates);

    if (refs.length === 0) throw new Error('当前 ARIA 快照中没有可点击元素');
    if (refs.length === 1) return { type: 'click', ref: refs[0] };

    const response = await this.client.systemOne({
      state: { goal: input.goal, steps: JSON.stringify(input.steps ?? []), candidates },
      questions: {
        target: choice(
          '为完成 goal，应点击哪个候选元素？steps 是已经执行的步骤，应避免重复或回退这些操作。只选择能推进目标的元素；不要选择取消、关闭、登出、删除或其他破坏性操作，除非 goal 明确要求。',
          candidates,
        ),
      },
    });

    const ref = response.answers.target.choice;
    if (!(ref in candidates)) throw new Error(`模型选择了不在当前快照中的 ref: ${ref}`);
    return { type: 'click', ref };
  }

  /** 在调用方明确提供的 URL 候选中决定导航目的地。 */
  async decideNavigate(input: {
    goal: string;
    candidates: readonly NavigateCandidate[];
  }): Promise<NavigateDecision> {
    const candidates = Object.fromEntries(input.candidates.map(({ url, label }) => [url, label]));
    const urls = Object.keys(candidates);

    if (urls.length === 0) throw new Error('没有可供导航的 URL 候选');
    if (urls.length === 1) return { type: 'navigate', url: urls[0] };

    const response = await this.client.systemOne({
      state: { goal: input.goal, candidates },
      questions: {
        target: choice('为完成 goal，应导航到哪个 URL？', candidates),
      },
    });

    const url = response.answers.target.choice;
    if (!(url in candidates)) throw new Error(`模型选择了不在候选中的 URL: ${url}`);
    return { type: 'navigate', url };
  }
}

export const jev = new Jev();
