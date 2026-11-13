import type { TelemetryAdapter } from '../../domain/contracts';
import type { ConnectionProfile } from './types';

export type AdapterFactory = (profile: ConnectionProfile) => TelemetryAdapter | Promise<TelemetryAdapter>;

/**
 * Registry of adapter factories keyed by connection type.
 * Add new sensor/protocol support by registering a factory/plugin; core engine unchanged.
 */
class ConnectionAdapterRegistry {
  private factories = new Map<ConnectionProfile['type'], AdapterFactory>();

  register(type: ConnectionProfile['type'], factory: AdapterFactory) {
    this.factories.set(type, factory);
  }

  has(type: ConnectionProfile['type']) { return this.factories.has(type); }

  async create(profile: ConnectionProfile): Promise<TelemetryAdapter> {
    const factory = this.factories.get(profile.type);
    if (!factory) throw new Error(`No adapter registered for connection type '${profile.type}'. Register a plugin or use a gateway.`);
    return factory(profile);
  }

  types(): string[] { return [...this.factories.keys()]; }
}

export const adapterRegistry = new ConnectionAdapterRegistry();

// Built-in plugs can be registered at app/bootstrap time, e.g. file/csv and gateway-http adapters.
// OT protocols (OPC UA/Modbus/MQTT direct) typically run in a gateway process; browser uses 'gateway' or 'rest-api' profile.
