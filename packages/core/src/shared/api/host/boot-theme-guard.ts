import type { DshHostContext, DshIndexRow } from '@dsh-workbench/shared';

const GUARD_SCRIPT = `(() => {
  const boot = () => {
    const root = document.documentElement;
    const read = () => root.getAttribute('data-ds-theme-source');
    const preference = read();
    if (preference !== 'light' && preference !== 'dark') return;
    const dark = preference === 'dark';
    const settle = () => {
      if (read() === 'system') document.body.toggleAttribute('data-ds-dark-theme', dark);
      else if (read() !== null) observer.disconnect();
    };
    const observer = new MutationObserver(settle);
    observer.observe(root, { attributes: true, attributeFilter: ['data-ds-theme-source'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    setTimeout(() => observer.disconnect(), 3000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();`;

export function registerBootThemeGuard(ctx: DshHostContext): void {
  ctx.on?.('webserver/index-inject', (table: DshIndexRow[]) => {
    table.push({ kind: 'script', placement: 'body', text: GUARD_SCRIPT });
  });
}
