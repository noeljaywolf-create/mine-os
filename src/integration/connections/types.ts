import { z } from 'zod';

/**
 * Connection profiles are DATA/CONFIG only. Adding or changing sensors, IPs,
 * APIs, protocols, or mappings must NOT require changes to core engine/domain
 * calculation modules. Adapters/gateways translate sources -> canonical samples.
 */

export const ConnectionAuthSchema = z.object({
  type: z.enum(['none', 'basic', 'bearer', 'api-key', 'certificate-ref']).default('none'),
  /** Reference name/id resolved by the gateway/secret store. Never put secrets in UI config. */
  secretRef: z.string().optional(),
  username: z.string().optional(),
  headerName: z.string().optional(),
}).default({ type: 'none' });

const BaseConnectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  /** Read-only by design for pilot/ops safety. */
  readOnly: z.literal(true).default(true),
  auth: ConnectionAuthSchema.optional(),
  /** Poll/subscribe interval hint (ms). Adapter/gateway may override. */
  pollIntervalMs: z.number().int().positive().default(5000),
  tags: z.array(z.string().min(1)).default([]), // source tag ids exposed by this connection
});

export const FileConnectionSchema = BaseConnectionSchema.extend({
  type: z.literal('file'),
  format: z.enum(['csv', 'json']).default('csv'),
  pathHint: z.string().optional(), // local/import hint; browser uses file picker
});

export const RestApiConnectionSchema = BaseConnectionSchema.extend({
  type: z.literal('rest-api'),
  baseUrl: z.string().url(), // https://host:port or http://ip:port
  samplesPath: z.string().default('/samples'),
  healthPath: z.string().default('/health'),
  method: z.enum(['GET', 'POST']).default('GET'),
  headers: z.record(z.string()).default({}),
});

export const MqttConnectionSchema = BaseConnectionSchema.extend({
  type: z.literal('mqtt'),
  brokerUrl: z.string().min(1), // mqtt(s)://ip:port or ws(s)://...
  topicPattern: z.string().min(1),
  qos: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
});

export const OpcUaConnectionSchema = BaseConnectionSchema.extend({
  type: z.literal('opcua'),
  endpointUrl: z.string().min(1), // opc.tcp://ip:port/...
  securityMode: z.string().default('None'),
  securityPolicy: z.string().default('None'),
  nodeIds: z.array(z.string()).default([]),
});

export const ModbusConnectionSchema = BaseConnectionSchema.extend({
  type: z.literal('modbus-tcp'),
  host: z.string().min(1), // IP/hostname
  port: z.number().int().positive().default(502),
  unitId: z.number().int().min(0).default(1),
  registers: z.array(z.object({ address: z.number().int().min(0), length: z.number().int().positive().default(1), tag: z.string().min(1) })).default([]),
});

export const GatewayConnectionSchema = BaseConnectionSchema.extend({
  type: z.literal('gateway'),
  /** URL of on-site/read-only gateway that connects to machines and serves canonical samples */
  gatewayUrl: z.string().url(),
  protocol: z.enum(['http-poll', 'sse', 'websocket']).default('http-poll'),
});

export const ConnectionProfileSchema = z.discriminatedUnion('type', [
  FileConnectionSchema,
  RestApiConnectionSchema,
  MqttConnectionSchema,
  OpcUaConnectionSchema,
  ModbusConnectionSchema,
  GatewayConnectionSchema,
]);
export type ConnectionProfile = z.infer<typeof ConnectionProfileSchema>;

export const ConnectionsConfigSchema = z.object({
  schemaVersion: z.literal(1),
  /** Profiles are deployment/site config. Core system unchanged per sensor/site. */
  connections: z.array(ConnectionProfileSchema).default([]),
});
export type ConnectionsConfig = z.infer<typeof ConnectionsConfigSchema>;
