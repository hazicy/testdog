import type { Browser } from 'playwright';
import type { WebTarget } from '../../target';

const webArtifacts = ['screenshot', 'snapshot', 'video', 'trace', 'console', 'network'];

export interface BrowserConnection {
  browser: Browser;
  provider: string;
  artifacts: string[];
  // Adapters own release semantics, including provider-specific session cleanup.
  close(): Promise<void>;
}
export interface BrowserProvider {
  id: string;
  supportedBrowsers: WebTarget['browser'][];
  connect(target: WebTarget, config: unknown, signal: AbortSignal): Promise<BrowserConnection>;
}

export function browserConnection(
  browser: Browser,
  provider: string,
  artifacts = webArtifacts,
): BrowserConnection {
  let closing: Promise<void> | undefined;

  return { browser, provider, artifacts, close: () => (closing ??= browser.close()) };
}
