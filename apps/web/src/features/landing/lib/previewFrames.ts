// Local example frames keep the public preview independent of private run artifacts.
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  );

export function previewFrameUrl(
  example: { url: string; title: string; subtitle: string },
  index: number,
) {
  const complete = index === 3;
  const title = complete ? example.title : 'Welcome back';
  const fields = ['Email', 'Password'];
  const values = ['tester@example.com', '••••••••'];
  const form = fields
    .map(
      (field, row) =>
        `<text x="388" y="${235 + row * 88}" fill="#a6a3a0" font-size="16">${field}</text><rect x="388" y="${249 + row * 88}" width="504" height="46" rx="6" fill="#1b1c20" stroke="${index === 1 ? '#b45736' : '#383a40'}"/><text x="404" y="${278 + row * 88}" fill="#f0ece8" font-size="17">${index > 0 ? values[row] : ''}</text>`,
    )
    .join('');
  const content = complete
    ? `<circle cx="640" cy="240" r="30" fill="#1c3025"/><path d="m626 240 10 10 19-21" fill="none" stroke="#91d6ac" stroke-width="4" stroke-linecap="round"/><text x="640" y="320" text-anchor="middle" font-size="32" font-weight="600">${escape(title)}</text><text x="640" y="361" text-anchor="middle" font-size="18" fill="#a6a3a0">${escape(example.subtitle)}</text>`
    : `<text x="388" y="183" font-size="32" font-weight="600">${title}</text>${form}<rect x="388" y="444" width="504" height="48" rx="6" fill="${index === 2 ? '#99482e' : '#b45736'}"/><text x="640" y="474" text-anchor="middle" fill="#fff8f4" font-size="17">Sign in</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><rect width="1280" height="800" fill="#101114"/><rect width="1280" height="56" fill="#1b1c20"/><circle cx="25" cy="28" r="5" fill="#52545a"/><circle cx="45" cy="28" r="5" fill="#52545a"/><circle cx="65" cy="28" r="5" fill="#52545a"/><rect x="320" y="12" width="640" height="32" rx="6" fill="#222328"/><g font-family="Arial, sans-serif" fill="#f0ece8"><text x="640" y="34" text-anchor="middle" font-size="14" fill="#a6a3a0">${escape(example.url)}</text><text x="48" y="112" font-size="22" font-weight="600">Acme.</text><rect x="340" y="132" width="600" height="500" rx="12" fill="#1b1c20" stroke="#303238"/>${content}</g></svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
