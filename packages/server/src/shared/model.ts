import type { ModelClient } from '@testdog/contracts/automation/llm/contracts';
import { deepseekClient } from '@testdog/automation/llm/deepseek';

export const modelClient: ModelClient = deepseekClient;
