import type { ModelClient } from '@testdog/contracts/automation/llm/contracts';
import { deepseekClient } from '@testdog/automation/llm/deepseek';
import { createJevModelClient } from '@testdog/automation/domAgent/clients';

export const modelClient: ModelClient = {
  generate(params) {
    if (params.provider === 'jev')
      return createJevModelClient({
        apiKey: process.env.JEV_API_KEY ?? '',
        endpoint: process.env.JEV_ENDPOINT,
        model: process.env.JEV_MODEL,
      }).generate(params);

    return deepseekClient.generate(params);
  },
};
