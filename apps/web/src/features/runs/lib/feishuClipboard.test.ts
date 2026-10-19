import { expect, it } from 'vitest';
import { parseFeishuClipboard } from './feishuClipboard';

// Sanitized fields from the observed whiteboard-x clipboard envelope.
const node = (id: string, text: string, parentId = '') => ({
  id,
  type: 24,
  toId: '',
  info: {
    baseV2: { x: 523.626, y: -768.836, width: 152, height: 48, angle: 0 },
    textV2: { text, fontSize: 14 },
    mindMap: { parentId, layoutType: 4 },
  },
  children: [],
  globalPos: { x: 523.626, y: -768.836 },
});
const wrap = (data: unknown) =>
  `<span data-info="--%whiteboard-x--${btoa(encodeURIComponent(JSON.stringify(data)))}--whiteboard-x%--" data-version="1.0"></span>`;

it('decodes Chinese text, geometry, hierarchy and resource references from HTML', () => {
  const data = [node('root', '测试 🐕'), node('child', '步骤：登录\n第二行', 'root')];
  const resource = [{ key: 'sample-resource', type: 1, refId: 'r1:1' }];
  const html = `<ul><li>fallback text</li></ul><img src="data:image/png;base64,ignored">${wrap({ token: 'ignored', data, resource })}`;

  expect(parseFeishuClipboard(html)).toEqual({ data, resource });
});

it('allows copying a subtree whose parent is outside the selection', () => {
  expect(parseFeishuClipboard(wrap({ data: [node('child', '节点', 'external')] }))).not.toBeNull();
});

it('ignores unrelated HTML', () => {
  expect(parseFeishuClipboard('<p>普通粘贴</p>')).toBeNull();
});

it('rejects damaged or unsupported payloads instead of importing fallback text', () => {
  for (const html of [
    '<span data-info="--%whiteboard-x--invalid!--whiteboard-x%--"></span>',
    wrap({ data: [] }),
    wrap({ data: [{ id: 'missing-info', type: 24 }] }),
    wrap({ data: [{ ...node('a', '节点'), info: { baseV2: { x: 'invalid' } } }] }),
    wrap({ data: [node('a', '节点'), node('a', '重复')] }),
    wrap({ data: [node('a', '节点', 'b'), node('b', '节点', 'a')] }),
  ])
    expect(() => parseFeishuClipboard(html)).toThrow();
});
