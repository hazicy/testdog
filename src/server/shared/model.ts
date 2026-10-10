import type { ModelClient } from '@/automation/llm/contracts';
import { deepseekClient } from '@/automation/llm/deepseek';

export const modelClient: ModelClient = deepseekClient;
