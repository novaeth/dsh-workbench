import styles from './BootGate.module.css';
export const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgIcon(kind: 'copy' | 'check'): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const shapes: Array<[string, Record<string, string>]> =
    kind === 'copy'
      ? [
          ['rect', { x: '5.5', y: '2.5', width: '8', height: '10', rx: '2' }],
          ['rect', { x: '2.5', y: '5.5', width: '8', height: '10', rx: '2' }],
        ]
      : [['path', { d: 'M3.2 8.6l3.1 3.1L12.8 5.2' }]];

  for (const [tag, attrs] of shapes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', '1.3');
    node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    svg.append(node);
  }
  return svg;
}

export function spinnerIcon(size = 14): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', styles.loading);

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', styles.loadingMotion);
  for (const name of [styles.loadingTrack, styles.loadingArc]) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '9.5');
    circle.setAttribute('class', name);
    group.append(circle);
  }
  svg.append(group);
  return svg;
}

export function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
