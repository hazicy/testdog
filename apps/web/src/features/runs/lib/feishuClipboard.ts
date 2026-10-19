import { z } from 'zod';

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const shape = z
  .object({
    id: z.string().min(1),
    type: z.number().int(),
    toId: z.string().optional(),
    info: z
      .object({
        baseV2: point.extend({
          width: z.number().finite().nonnegative(),
          height: z.number().finite().nonnegative(),
          angle: z.number().finite().optional(),
        }),
        textV2: z.object({ text: z.string() }).passthrough().optional(),
        mindMap: z.object({ parentId: z.string() }).passthrough().optional(),
      })
      .passthrough(),
    globalPos: point.optional(),
  })
  .passthrough();

export type FeishuClipboardShape = z.infer<typeof shape>;

const payload = z.object({
  data: z.array(shape).min(1),
  resource: z
    .array(
      z
        .object({
          key: z.string(),
          type: z.number().int(),
          refId: z.string(),
        })
        .passthrough(),
    )
    .optional(),
});

// Feishu wraps URI-encoded JSON in Base64 inside a data-info HTML attribute.
// Match the wrapper directly: parsing the surrounding HTML could load its images.
export function parseFeishuClipboard(html: string) {
  const match = /data-info\s*=\s*["']--%whiteboard-x--([A-Za-z0-9+/=]+)--whiteboard-x%--["']/i.exec(
    html,
  );

  if (!match) {
    if (html.includes('--%whiteboard-x--')) throw new Error('Invalid Feishu clipboard wrapper');

    return null;
  }

  const parsed = payload.parse(JSON.parse(decodeURIComponent(atob(match[1]))));
  const ids = new Set<string>();

  for (const node of parsed.data) {
    if (ids.has(node.id)) throw new Error('Duplicate Feishu shape ID');
    ids.add(node.id);
  }

  // A parent outside the copied selection is valid; cycles within it are not.
  const parents = new Map(parsed.data.map((node) => [node.id, node.info.mindMap?.parentId]));
  const visited = new Set<string>();

  for (const node of parsed.data) {
    const path = new Set<string>();
    let id: string | undefined = node.id;

    while (id && parents.has(id) && !visited.has(id)) {
      if (path.has(id)) throw new Error('Cyclic Feishu mind map');
      path.add(id);
      id = parents.get(id);
    }

    for (const id of path) visited.add(id);
  }

  return parsed;
}
