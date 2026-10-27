function manifestAuthor(manifest) {
  const author = manifest?.author;
  if (typeof author === 'string') return author.trim();
  if (author !== null && typeof author === 'object' && typeof author.name === 'string') return author.name.trim();
  return '';
}

function configValue(exec, root, key) {
  const result = exec('git', ['-C', root, 'config', key], { capture: true, allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : '';
}

export function authorChangeOf(root, manifest, exec) {
  if (manifestAuthor(manifest) !== '') return {};
  const name = configValue(exec, root, 'user.name');
  if (name === '') return {};
  const email = configValue(exec, root, 'user.email');
  return {
    author: email === '' ? name : `${name} <${email}>`,
    change: 'author ← git config',
  };
}
