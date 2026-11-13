export * from './types';
export * from './registry';
export * from './gatewayHttpAdapter';
export { GatewayHttpAdapter } from './gatewayHttpAdapter';

import { adapterRegistry } from './registry';
import { GatewayHttpAdapter } from './gatewayHttpAdapter';
import type { ConnectionProfile } from './types';

// Built-in plugin: gateway profile -> HTTP polling adapter (browser-safe). Core unchanged.
adapterRegistry.register('gateway', (profile) => {
  const p = profile as ConnectionProfile & { gatewayUrl: string };
  return new GatewayHttpAdapter({ gatewayUrl: p.gatewayUrl });
});
