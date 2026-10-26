export const ICON = {
  left: '<path d="M1.5 3h13M1.5 6.3h8.5M1.5 9.7h13M1.5 13h8.5"/>',
  center: '<path d="M1.5 3h13M4 6.3h8M1.5 9.7h13M4 13h8"/>',
  right: '<path d="M1.5 3h13M6 6.3h8.5M1.5 9.7h13M6 13h8.5"/>',
  signature:
    '<path d="M1.5 14h13M2.3 9.2l2.6 2.6M4.9 9.2l-2.6 2.6"/>' +
    '<path d="M8 11.5l.6-2.3 5.1-5.1a1.2 1.2 0 0 1 1.7 1.7l-5.1 5.1z"/>',
  bullet:
    '<circle cx="3" cy="4" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="3" cy="12" r="1.1" fill="currentColor" stroke="none"/>' +
    '<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/>',
  ordered:
    '<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/>' +
    '<text x="0.6" y="5.7" font-size="5.5" fill="currentColor" stroke="none">1</text>' +
    '<text x="0.6" y="9.7" font-size="5.5" fill="currentColor" stroke="none">2</text>' +
    '<text x="0.6" y="13.7" font-size="5.5" fill="currentColor" stroke="none">3</text>',
  quote:
    '<path fill="currentColor" stroke="none" d="M7.1 3.9c-2.1.9-3.6 2.8-3.6 5.1 0 1.8 1.2 3 2.8 3 1.4 0 2.5-1.1 2.5-2.5 0-1.3-1-2.3-2.2-2.3-.2 0-.5 0-.7.1.3-1.1 1.1-2 2.2-2.5z"/>' +
    '<path fill="currentColor" stroke="none" d="M13.9 3.9c-2.1.9-3.6 2.8-3.6 5.1 0 1.8 1.2 3 2.8 3 1.4 0 2.5-1.1 2.5-2.5 0-1.3-1-2.3-2.2-2.3-.2 0-.5 0-.7.1.3-1.1 1.1-2 2.2-2.5z"/>',
  table:
    '<rect x="3" y="3" width="10" height="10" rx="1.2"/>' +
    '<path d="M3 8h10M8 3v10"/>',
  pagebreak:
    '<path d="M3.5 1.5v4h9v-4M3.5 14.5v-4h9v4"/>' +
    '<path d="M1.5 8h2M5.5 8h2M9.5 8h2M13.5 8h1"/>',
  image:
    '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>' +
    '<circle cx="5.5" cy="6.3" r="1.3"/>' +
    '<path d="M1.5 11.5l3.8-3.6 2.7 2.5 2.2-2 4.3 4"/>',
  link:
    '<path d="M6.9 9.1a3.1 3.1 0 0 0 4.4.3l1.9-1.9a3.1 3.1 0 0 0-4.4-4.4l-1 1"/>' +
    '<path d="M9.1 6.9a3.1 3.1 0 0 0-4.4-.3l-1.9 1.9a3.1 3.1 0 0 0 4.4 4.4l1-1"/>',
  environment:
    '<rect x="1.5" y="2.5" width="13" height="11" rx="2.5"/>' +
    '<path d="M4.5 6.2h7M4.5 9.8h4.5"/>',
  matrix:
    '<path d="M4.5 2.5c-2.2 1.8-2.2 9.2 0 11M11.5 2.5c2.2 1.8 2.2 9.2 0 11"/>' +
    '<circle cx="6.5" cy="5.5" r="0.9" fill="currentColor" stroke="none"/>' +
    '<circle cx="9.5" cy="5.5" r="0.9" fill="currentColor" stroke="none"/>' +
    '<circle cx="6.5" cy="10.5" r="0.9" fill="currentColor" stroke="none"/>' +
    '<circle cx="9.5" cy="10.5" r="0.9" fill="currentColor" stroke="none"/>',
  system:
    '<path d="M5.5 2.5c-1.6 0-1.6 1.2-1.6 2.7S3.8 8 2.3 8c1.5 0 1.6 1.3 1.6 2.8s0 2.7 1.6 2.7"/>' +
    '<path d="M8 5.3h6M8 10.7h6"/>',
} as const;

export function svg(body: string): string {
  return (
    '<svg viewBox="-0.8 -0.8 17.6 17.6" width="20" height="20" aria-hidden="true" ' +
    'fill="none" stroke="currentColor" stroke-width="1.4" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    body +
    "</svg>"
  );
}
