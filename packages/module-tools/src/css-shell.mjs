const SHELL_CLASS = /^wb-[A-Za-z0-9-]+$/;
const CLASS_TOKEN = /\.([A-Za-z_-][\w-]*)/g;

const SELECTOR_TEXT = /^[\s,>+~.:#*()&[\]\w-]*$/;

function compoundsOf(selector) {
  return selector
    .split(',')
    .flatMap((part) => part.trim().split(/[\s>+~]+/))
    .filter((compound) => compound !== '');
}

function classesIn(compound) {
  return Array.from(compound.matchAll(CLASS_TOKEN), (match) => match[1]);
}

export function shellOnlyCompound(selector) {
  if (!SELECTOR_TEXT.test(selector)) return undefined;
  return compoundsOf(selector).find((compound) => {
    const classes = classesIn(compound);
    return classes.length > 0 && classes.every((name) => SHELL_CLASS.test(name));
  });
}

export function shellRulesIn(cssText) {
  const found = [];
  for (const line of cssText.split('\n')) {
    const brace = line.indexOf('{');
    if (brace >= 0 && shellOnlyCompound(line.slice(0, brace)) !== undefined) {
      found.push(line.slice(0, brace).trim());
    }
    const keyframes = /@keyframes\s+(wb-[a-z0-9-]+)/.exec(line);
    if (keyframes !== null) found.push(`@keyframes ${keyframes[1]}`);
  }
  return found;
}

export function inlinedShellRules(artifactText) {

  const text = artifactText.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  const found = [];

  for (const match of text.matchAll(/(?:^|[\n;{}"'])[ \t]*([\s,>+~.:#*()&[\]\w-]*?)[ \t]*\{/gm)) {
    const selector = match[1];
    if (selector.trimStart().startsWith('@')) continue;
    if (shellOnlyCompound(selector) !== undefined) found.push(selector.trim());
  }
  for (const match of text.matchAll(/@keyframes\s+(wb-[a-z0-9-]+)/g)) {
    found.push(`@keyframes ${match[1]}`);
  }
  return [...new Set(found)];
}
