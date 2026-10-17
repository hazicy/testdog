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
        `<text x="388" y="${235 + row * 88}" fill="#6b7280" font-size="16">${field}</text><rect x="388" y="${249 + row * 88}" width="504" height="46" rx="6" fill="#ffffff" stroke="${index === 1 ? '#b45736' : '#dfe3e8'}"/><text x="404" y="${278 + row * 88}" fill="#151922" font-size="17">${index > 0 ? values[row] : ''}</text>`,
    )
    .join('');
  const content = complete
    ? `<circle cx="640" cy="240" r="30" fill="#edf7f0"/><path d="m626 240 10 10 19-21" fill="none" stroke="#28764f" stroke-width="4" stroke-linecap="round"/><text x="640" y="320" text-anchor="middle" font-size="32" font-weight="600">${escape(title)}</text><text x="640" y="361" text-anchor="middle" font-size="18" fill="#6b7280">${escape(example.subtitle)}</text>`
    : `<text x="388" y="183" font-size="32" font-weight="600">${title}</text>${form}<rect x="388" y="444" width="504" height="48" rx="6" fill="${index === 2 ? '#99482e' : '#b45736'}"/><text x="640" y="474" text-anchor="middle" fill="#fff8f4" font-size="17">Sign in</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><rect width="1280" height="800" fill="#f7f8fa"/><rect width="1280" height="56" fill="#ffffff"/><circle cx="25" cy="28" r="5" fill="#c5cbd3"/><circle cx="45" cy="28" r="5" fill="#c5cbd3"/><circle cx="65" cy="28" r="5" fill="#c5cbd3"/><rect x="320" y="12" width="640" height="32" rx="6" fill="#f1f3f5"/><g font-family="Arial, sans-serif" fill="#151922"><text x="640" y="34" text-anchor="middle" font-size="14" fill="#6b7280">${escape(example.url)}</text><text x="48" y="112" font-size="22" font-weight="600">Acme.</text><rect x="340" y="132" width="600" height="500" rx="12" fill="#ffffff" stroke="#e5e8ed"/>${content}</g></svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
