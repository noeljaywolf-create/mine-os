import type { ModelManifest } from '@mine-os/contracts';

/** In-memory/file-backed registry interface for versioned, provenanced models. */
export interface ModelRegistry {
  register(model: ModelManifest): Promise<void>;
  get(modelId: string, version?: string): Promise<ModelManifest | undefined>;
  list(filter?: { agentId?: string; status?: ModelManifest['status']; target?: string }): Promise<ModelManifest[]>;
}

export class InMemoryModelRegistry implements ModelRegistry {
  private models: ModelManifest[] = [];

  async register(model: ModelManifest): Promise<void> {
    const idx = this.models.findIndex(m => m.id === model.id && m.version === model.version);
    if (idx >= 0) this.models[idx] = model; else this.models.push(model);
  }

  async get(modelId: string, version?: string): Promise<ModelManifest | undefined> {
    const matches = this.models.filter(m => m.id === modelId);
    if (!matches.length) return undefined;
    if (version) return matches.find(m => m.version === version);
    return matches.sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
  }

  async list(filter?: { agentId?: string; status?: ModelManifest['status']; target?: string }): Promise<ModelManifest[]> {
    return this.models.filter(m => (!filter?.agentId || m.agentId === filter.agentId) && (!filter?.status || m.status === filter.status) && (!filter?.target || m.target === filter.target));
  }
}

export function createRegistry(): ModelRegistry {
  // Replace with Postgres/object-store backed registry in production deployment.
  return new InMemoryModelRegistry();
}
