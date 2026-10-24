export const PAGE_PROBE = `(async () => {
  const answer = await fetch('/workbench/api/health').then((one) => one.json()).catch(() => null);
  const root = document.querySelector('.wb-root');
  const where = root === null ? '' : (root.getAttribute('data-wb-where') ?? '');
  const bar = document.querySelector('.wb-rightbar');
  const board = bar === null ? '' : (bar.getAttribute('data-wb-board') ?? '');
  const open = bar === null ? null : bar.hasAttribute('data-wb-open');
  const style = bar === null ? null : getComputedStyle(bar);
  const box = bar === null ? null : bar.getBoundingClientRect();
  const drawn =
    bar !== null &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    box.width > 0 &&
    box.height > 0;
  return JSON.stringify({
    plugin: answer === null ? null : answer.plugin,
    pid: answer === null ? null : answer.pid,
    url: location.href,
    title: document.title,
    where,
    board,
    open,
    shown: drawn,
  });
})()`;

export function cardSelectorOf(unit: string): string {
  return `#wb-card-${unit}`;
}
