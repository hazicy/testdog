import { randomUUID } from 'node:crypto';
import type { ElementHandle, Page } from 'playwright';
import type { Candidate } from './types';

export type Snapshot = {
  candidates: Candidate[];
  registry: Map<string, ElementHandle<HTMLElement | SVGElement>>;
  dispose: () => Promise<void>;
};

// Element handles bind IDs to the exact nodes observed, never to mutable nth() selectors.
// Playwright CSS locators pierce open shadow roots. Each attached frame is inspected separately.
export async function extractDOM(page: Page): Promise<Snapshot> {
  const registry: Snapshot['registry'] = new Map();
  const allocated = new Set<ElementHandle<HTMLElement | SVGElement>>();
  const candidates: Candidate[] = [];
  const revision = randomUUID();
  const dispose = async () => {
    await Promise.allSettled([...allocated].map((handle) => handle.dispose()));
    allocated.clear();
    registry.clear();
  };

  try {
    for (const frame of page.frames()) {
      const handles = (await frame
        .locator(
          'a[href],button,input,textarea,select,summary,[role],[tabindex],[contenteditable="true"]',
        )
        .elementHandles()) as ElementHandle<HTMLElement | SVGElement>[];

      handles.forEach((handle) => allocated.add(handle));

      for (const handle of handles) {
        let retained = false;

        try {
          const data = await handle.evaluate((node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();

            if (
              !node.isConnected ||
              !rect.width ||
              !rect.height ||
              style.visibility !== 'visible' ||
              style.display === 'none' ||
              node.closest('[hidden],[inert],[aria-hidden="true"]')
            )
              return null;
            const tag = node.tagName.toLowerCase();
            const inputType = node.getAttribute('type')?.toLowerCase() ?? 'text';
            const implicit =
              tag === 'a'
                ? 'link'
                : tag === 'button' || tag === 'summary'
                  ? 'button'
                  : tag === 'select'
                    ? 'combobox'
                    : tag === 'textarea'
                      ? 'textbox'
                      : tag === 'input'
                        ? ['checkbox', 'radio'].includes(inputType)
                          ? inputType
                          : ['submit', 'reset', 'button'].includes(inputType)
                            ? 'button'
                            : 'textbox'
                        : '';
            const role = node.getAttribute('role') ?? implicit;
            const root = node.getRootNode() as Document | ShadowRoot;
            const labelled = (node.getAttribute('aria-labelledby') ?? '')
              .split(/\s+/)
              .map((id) => root.getElementById(id)?.textContent ?? '')
              .join(' ')
              .trim();
            const labels =
              'labels' in node
                ? Array.from((node as HTMLInputElement).labels ?? [])
                    .map((label) => label.textContent)
                    .join(' ')
                : '';
            const name = (
              labelled ||
              node.getAttribute('aria-label') ||
              labels ||
              node.getAttribute('alt') ||
              node.getAttribute('title') ||
              node.getAttribute('placeholder') ||
              (['submit', 'reset', 'button'].includes(inputType)
                ? node.getAttribute('value')
                : '') ||
              node.textContent ||
              ''
            )
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 300);
            const container = node.parentElement?.closest(
              'tr,[role="row"],li,fieldset,[role="group"],article,section',
            );
            const editable =
              (node as HTMLElement).isContentEditable ||
              tag === 'textarea' ||
              (tag === 'input' &&
                ['text', 'search', 'email', 'tel', 'url', 'password', 'number'].includes(
                  inputType,
                ));

            return {
              tag,
              role,
              name,
              inputType,
              editable,
              text: (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
              context: (container?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
              href: (node.getAttribute('href') ?? '').trim().slice(0, 500),
              enabled:
                !node.matches(':disabled') &&
                !node.closest('[aria-disabled="true"]') &&
                !(editable && node.hasAttribute('readonly')),
              inViewport:
                rect.bottom > 0 &&
                rect.right > 0 &&
                rect.top < innerHeight &&
                rect.left < innerWidth,
            };
          });

          if (!data) continue;
          const id = `e_${revision}_${candidates.length}`;

          candidates.push({ ...data, id, frameUrl: frame.url() });
          registry.set(id, handle);
          retained = true;
        } finally {
          if (!retained) {
            await handle.dispose();
            allocated.delete(handle);
          }
        }
      }
    }

    return { candidates, registry, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
