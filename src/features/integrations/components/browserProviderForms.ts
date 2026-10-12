import type { ComponentType } from 'react';
import type { BrowserProviderIntegration } from '../types';
import { BrowserlessForm } from './BrowserlessForm';

export type BrowserProviderFormProps = {
  integration: BrowserProviderIntegration;
  onSaved: () => Promise<unknown>;
  onDismiss: () => void;
};
// Register each provider's configuration UI independently of the integrations page.
export const browserProviderForms: Record<string, ComponentType<BrowserProviderFormProps>> = {
  browserless: BrowserlessForm,
};
