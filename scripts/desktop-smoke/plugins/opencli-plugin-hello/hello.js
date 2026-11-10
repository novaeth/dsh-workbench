import { cli, Strategy } from '@jackwener/opencli/registry';

const SITE = 'hello';
const PLUGIN_VERSION = '1.0.0';
const GREETING = 'hello from opencli-plugin-hello';

export const hello = cli({
  site: SITE,
  name: 'hello',
  access: 'read',
  description: 'Print a fixed greeting line, proving the plugin was installed and loaded',
  example: 'opencli hello hello -f table',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [],
  columns: ['Greeting', 'Plugin', 'Version'],
  func: async () => [
    {
      Greeting: GREETING,
      Plugin: SITE,
      Version: PLUGIN_VERSION,
    },
  ],
});
