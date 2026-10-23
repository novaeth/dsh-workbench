export const STYLE_MARKER = 'data-dsh-workbench';

export function installWorkbenchStyles(
  css: string,
  doc: Pick<Document, 'head' | 'querySelector' | 'createElement'> = document,
): void {
  const applied = doc.querySelector(`style[${STYLE_MARKER}]`);
  const style = applied ?? doc.createElement('style');
  if (applied === null) {
    style.setAttribute(STYLE_MARKER, '');
    doc.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}
