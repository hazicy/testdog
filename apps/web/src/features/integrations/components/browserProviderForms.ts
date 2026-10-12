import type { ComponentType } from 'react';
import type { BrowserProviderIntegration } from '@testdog/contracts/integrations/types';
import { BrowserlessForm } from '@/features/integrations/components/BrowserlessForm';

export type BrowserProviderFormProps = {
  integration: BrowserProviderIntegration;
  onSaved: () => Promise<unknown>;
  onDismiss: () => void;
};
// Register each provider's configuration UI independently of the integrations page.
export const browserProviderForms: Record<string, ComponentType<BrowserProviderFormProps>> = {
  browserless: BrowserlessForm,
};
