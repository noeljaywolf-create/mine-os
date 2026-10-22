import type { AssetDependency, AssetId, DependencyType } from '../domain/types';

/**
 * Typed directed dependency graph.
 *
 * An edge `from -> to` always means "from provides something to to". Failure
 * therefore propagates along the direction of the edge.
 */
export class DependencyGraph {
  readonly edges: AssetDependency[];
  readonly outgoing = new Map<AssetId, AssetDependency[]>();
  readonly incoming = new Map<AssetId, AssetDependency[]>();
  readonly nodes = new Set<AssetId>();

  constructor(edges: AssetDependency[], nodes: AssetId[] = []) {
    this.edges = edges;
    for (const node of nodes) this.nodes.add(node);
    for (const edge of edges) {
      this.nodes.add(edge.from);
      this.nodes.add(edge.to);
      if (!this.outgoing.has(edge.from)) this.outgoing.set(edge.from, []);
      if (!this.incoming.has(edge.to)) this.incoming.set(edge.to, []);
      this.outgoing.get(edge.from)!.push(edge);
      this.incoming.get(edge.to)!.push(edge);
    }
  }

  out(assetId: AssetId, type?: DependencyType): AssetDependency[] {
    const list = this.outgoing.get(assetId) ?? [];
    return type ? list.filter((edge) => edge.type === type) : list;
  }

  in(assetId: AssetId, type?: DependencyType): AssetDependency[] {
    const list = this.incoming.get(assetId) ?? [];
    return type ? list.filter((edge) => edge.type === type) : list;
  }

  /** Every asset that depends, directly or transitively, on `assetId`. */
  dependentsOf(assetId: AssetId, maxDepth = 6): Array<{ assetId: AssetId; depth: number; path: AssetId[] }> {
    const seen = new Map<AssetId, number>();
    const result: Array<{ assetId: AssetId; depth: number; path: AssetId[] }> = [];
    let frontier: Array<{ id: AssetId; path: AssetId[] }> = [{ id: assetId, path: [assetId] }];
    seen.set(assetId, 0);
    let depth = 0;
    while (frontier.length && depth < maxDepth) {
      depth += 1;
      const next: Array<{ id: AssetId; path: AssetId[] }> = [];
      for (const node of frontier) {
        for (const edge of this.out(node.id)) {
          if (seen.has(edge.to)) continue;
          seen.set(edge.to, depth);
          const path = [...node.path, edge.to];
          result.push({ assetId: edge.to, depth, path });
          next.push({ id: edge.to, path });
        }
      }
      frontier = next;
    }
    return result;
  }

  /** Every asset that `assetId` depends on, transitively (its dependencies). */
  dependenciesOf(assetId: AssetId, maxDepth = 6): Array<{ assetId: AssetId; depth: number; path: AssetId[] }> {
    const seen = new Map<AssetId, number>();
    const result: Array<{ assetId: AssetId; depth: number; path: AssetId[] }> = [];
    let frontier: Array<{ id: AssetId; path: AssetId[] }> = [{ id: assetId, path: [assetId] }];
    seen.set(assetId, 0);
    let depth = 0;
    while (frontier.length && depth < maxDepth) {
      depth += 1;
      const next: Array<{ id: AssetId; path: AssetId[] }> = [];
      for (const node of frontier) {
        for (const edge of this.in(node.id)) {
          if (seen.has(edge.from)) continue;
          seen.set(edge.from, depth);
          const path = [edge.from, ...node.path];
          result.push({ assetId: edge.from, depth, path });
          next.push({ id: edge.from, path });
        }
      }
      frontier = next;
    }
    return result;
  }

  /** Shortest dependency chain between two assets (undirected BFS). */
  pathBetween(from: AssetId, to: AssetId): AssetId[] | null {
    const queue: AssetId[][] = [[from]];
    const seen = new Set<AssetId>([from]);
    while (queue.length) {
      const path = queue.shift()!;
      const head = path[path.length - 1];
      if (head === to) return path;
      const neighbours = [
        ...this.outgoing.get(head) ?? [],
        ...this.incoming.get(head) ?? [],
      ];
      for (const edge of neighbours) {
        const other = edge.from === head ? edge.to : edge.from;
        if (seen.has(other)) continue;
        seen.add(other);
        queue.push([...path, other]);
      }
    }
    return null;
  }
}
