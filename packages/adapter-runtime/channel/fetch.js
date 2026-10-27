import { cli } from '@jackwener/opencli/registry';
import { perform, SHARED_ARGS } from './core.js';

cli({
  site: 'workbench',
  name: 'fetch',
  access: 'read',
  description: '用浏览器登录态在 Node 侧发一条 GET（工作台配方通道）',
  browser: true,
  navigateBefore: false,
  defaultFormat: 'json',
  args: SHARED_ARGS,
  func: async (page, kwargs) => perform(page, kwargs, 'GET'),
});
