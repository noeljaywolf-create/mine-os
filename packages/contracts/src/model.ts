// Model-provider interface (day one): stubbed/deterministic reviewer path + pluggable local/cloud providers via gateway.

export interface ModelMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface ModelRequest {
  purpose: 'planner' | 'review' | 'summary';
  messages: ModelMessage[];
  metadata?: Record<string, unknown>;
  // provider/model/routing decided by gateway config; sensitive context can be restricted to approved local processing
}
export interface ModelResponse {
  content: string;
  model?: string;
  provider?: string;
  deterministic: boolean;
  usage?: { inputTokens?: number; outputTokens?: number };
  recordedAtMs: number;
}

export interface ModelProvider {
  id: string;
  generate(req: ModelRequest): Promise<ModelResponse>;
}

export class DeterministicStubModelProvider implements ModelProvider {
  id = 'deterministic-stub';
  async generate(req: ModelRequest): Promise<ModelResponse> {
    return {
      content: `[deterministic-stub] reviewed ${req.purpose}; no external model call.`,
      model: 'stub',
      provider: 'local',
      deterministic: true,
      recordedAtMs: Date.now(),
    };
  }
}
