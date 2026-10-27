import { cli } from '@jackwener/opencli/registry';
import { perform, SHARED_ARGS } from './core.js';

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

cli({
  site: 'workbench',
  name: 'send',
  access: 'write',
  description: '用浏览器登录态在 Node 侧发一条写请求（工作台配方通道；只有写工具会调它）',
  browser: true,
  navigateBefore: false,
  defaultFormat: 'json',
  args: [
    ...SHARED_ARGS,
    { name: 'method', required: true, help: `写方法：${WRITE_METHODS.join(' / ')}` },
    { name: 'body', help: '请求体（json 时是 JSON 字符串，form 时是 k=v&k=v）' },
    { name: 'contentType', default: 'json', help: '请求体类型：json / form' },
  ],
  func: async (page, kwargs) => {
    const method = String(kwargs.method ?? '').toUpperCase();
    if (!WRITE_METHODS.includes(method)) {
      throw new Error(`--method 只认 ${WRITE_METHODS.join(' / ')}，收到 ${String(kwargs.method ?? '')}`);
    }
    return perform(page, kwargs, method);
  },
});
