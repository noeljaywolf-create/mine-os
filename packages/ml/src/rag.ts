import type { KnowledgeChunk, KnowledgeDocument, RetrievalHit, RetrievalRequest, RetrievalResponse } from '@mine-os/contracts';

/**
 * RAG/knowledge scaffold (Approach B). Retrieved content is UNTRUSTED context: always cited, never treated as ground truth,
 * and never used to bypass deterministic checks, policy, or safety controls.
 */

export interface KnowledgeStore {
  upsertDocument(doc: KnowledgeDocument): Promise<void>;
  upsertChunks(chunks: KnowledgeChunk[]): Promise<void>;
  listDocuments(filter?: { approved?: boolean; docType?: string; tag?: string }): Promise<KnowledgeDocument[]>;
  getChunks(documentId: string): Promise<KnowledgeChunk[]>;
}

export interface Retriever {
  retrieve(req: RetrievalRequest): Promise<RetrievalResponse>;
}

export class InMemoryKnowledgeStore implements KnowledgeStore {
  docs = new Map<string, KnowledgeDocument>();
  chunks = new Map<string, KnowledgeChunk[]>();
  async upsertDocument(doc: KnowledgeDocument): Promise<void> { this.docs.set(doc.id, doc); }
  async upsertChunks(chunks: KnowledgeChunk[]): Promise<void> {
    if (!chunks.length) return;
    const byDoc = new Map<string, KnowledgeChunk[]>();
    for (const c of chunks) { const arr = byDoc.get(c.documentId) || []; arr.push(c); byDoc.set(c.documentId, arr); }
    for (const [docId, arr] of byDoc) {
      const existing = this.chunks.get(docId) || [];
      const merged = [...existing.filter(e => !arr.some(n => n.id === e.id)), ...arr].sort((a,b)=>a.chunkIndex-b.chunkIndex);
      this.chunks.set(docId, merged);
    }
  }
  async listDocuments(filter?: { approved?: boolean; docType?: string; tag?: string }): Promise<KnowledgeDocument[]> {
    return [...this.docs.values()].filter(d => (filter?.approved == null || d.approved === filter.approved) && (!filter?.docType || d.docType === filter.docType) && (!filter?.tag || d.tags.includes(filter.tag)));
  }
  async getChunks(documentId: string): Promise<KnowledgeChunk[]> { return this.chunks.get(documentId) || []; }
}

/** Simple lexical retriever baseline (replace with embedding/vector+hybrid retriever in production). */
export class LexicalRetriever implements Retriever {
  constructor(private store: KnowledgeStore) {}
  async retrieve(req: RetrievalRequest): Promise<RetrievalResponse> {
    const docs = await this.store.listDocuments(req.requireApproved ? { approved: true } : undefined);
    const terms = req.query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
    const hits: RetrievalHit[] = [];
    for (const doc of docs) {
      const chunks = await this.store.getChunks(doc.id);
      for (const chunk of chunks) {
        const text = chunk.text.toLowerCase();
        let score = 0;
        for (const t of terms) if (text.includes(t)) score += 1;
        if (score <= 0) continue;
        hits.push({
          chunkId: chunk.id, documentId: doc.id, score,
          text: chunk.text,
          citation: { title: doc.title, source: doc.source, uri: doc.uri, version: doc.version, chunkIndex: chunk.chunkIndex },
          untrusted: true,
          metadata: { docType: doc.docType, approved: doc.approved, tags: doc.tags },
        });
      }
    }
    hits.sort((a,b)=>b.score-a.score);
    return { query: req.query, hits: hits.slice(0, req.topK), atMs: Date.now(), provenance: { retriever: 'lexical-baseline', requireApproved: req.requireApproved }, note: 'Retrieved content is untrusted context; verify against approved sources and deterministic evidence. Cite chunks; do not treat as ground truth.' };
  }
}

export function chunkText(documentId: string, text: string, opts?: { maxChars?: number; overlap?: number }): KnowledgeChunk[] {
  const maxChars = opts?.maxChars ?? 900;
  const overlap = opts?.overlap ?? 120;
  const clean = text.replace(/\r\n/g, '\n');
  const chunks: KnowledgeChunk[] = [];
  let i = 0; let idx = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + maxChars);
    const slice = clean.slice(i, end).trim();
    if (slice) chunks.push({ id: `${documentId}::${idx}`, documentId, text: slice, chunkIndex: idx, startOffset: i, endOffset: end, metadata: {} });
    if (end >= clean.length) break;
    i = Math.max(0, end - overlap);
    idx += 1;
  }
  return chunks;
}
