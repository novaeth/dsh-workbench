import { createPreflight } from '../index.js';
import { createFakeShell } from '@dsh-workbench/shared/testing';

export const GOOD_BRIDGE_REPORT = [
  'opencli v1.8.7 doctor (node v24.15.0)',
  '',
  '[OK] Daemon: running on port 19825 (v1.8.7)',
  '[OK] Extension: connected (v1.0.24)',
  '[OK] Connectivity: connected in 0.0s',
  '',
  'Everything looks good!',
].join('\n');

export const ALL_OK = [{ stdout: '1.8.8\n' }, { stdout: GOOD_BRIDGE_REPORT }];

export const STALE_DAEMON_BRIDGE = [
  'opencli v1.8.7 doctor (node v24.15.0)',
  '',
  '[STALE] Daemon: running on port 19825 (v1.8.8 != CLI v1.8.7)',
  '[OK] Extension: connected (v1.0.24)',
  '[OK] Connectivity: connected in 0.0s',
  '',
  'Issues:',
  '  • Stale daemon detected: daemon v1.8.8 != CLI v1.8.7.',
  '  Run: opencli daemon restart',
].join('\n');

export const BROKEN_BRIDGE = [
  'opencli v1.8.7 doctor (node v24.15.0)',
  '',
  '[MISSING] Daemon: not running',
  '[MISSING] Extension: not connected',
  '[FAIL] Connectivity: failed (daemon not reachable)',
  '',
  'Issues:',
  "  • Daemon is not running. It should start automatically when you run an opencli browser command.",
  '  • Daemon is running but the Chrome/Chromium extension is not connected.',
  'If the extension is not installed:',
  '  1. Download from https://github.com/jackwener/opencli/releases',
  '  2. Open chrome://extensions/ → Enable Developer Mode',
  '  3. Click "Load unpacked" → select the extension folder',
].join('\n');

export const EXTENSION_ONLY_BRIDGE = [
  'opencli v1.8.7 doctor (node v24.15.0)',
  '',
  '[OK] Daemon: running on port 19825 (v1.8.7)',
  '[MISSING] Extension: not connected',
  '[FAIL] Connectivity: failed (extension not connected)',
  '',
  'Issues:',
  '  • Daemon is running but the Chrome/Chromium extension is not connected.',
].join('\n');

export function build(
  replies: Parameters<typeof createFakeShell>[0],
  install?: () => Promise<{ ok: boolean; detail: string }>,
  warmReads?: () => readonly (readonly string[])[],
) {
  const fake = createFakeShell(replies);
  const preflight = createPreflight({
    shell: fake.shell,
    ...(install === undefined ? {} : { install }),
    ...(warmReads === undefined ? {} : { warmReads }),
  });
  return { fake, preflight };
}
