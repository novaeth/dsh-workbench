export function cssInjectionCode(key, css) {
  return [
    `const css = ${JSON.stringify(css)};`,
    `const key = ${JSON.stringify(key)};`,
    "if (typeof document !== 'undefined') {",
    "  const selector = 'style[data-dsh-wb-css=\"' + key + '\"]';",
    "  const applied = document.querySelector(selector);",
    "  const style = applied === null ? document.createElement('style') : applied;",
    "  if (applied === null) {",
    "    style.setAttribute('data-dsh-wb-css', key);",
    "    document.head.appendChild(style);",
    "  }",
    "  if (style.textContent !== css) style.textContent = css;",
    "}",
  ].join('\n');
}
