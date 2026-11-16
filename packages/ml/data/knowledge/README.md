# Approved knowledge corpus (Approach B - RAG)

Place **approved, versioned** site documents here (or configure an external index) for cited retrieval:
- Manuals, SOPs, P&IDs, setpoints/limits, emergency/water-management procedures
- Maintenance procedures and known failure modes
- Incident/near-miss reports and learnings (approved)

**Rules:** retrieved content is **UNTRUSTED** context (cite and verify against deterministic evidence, measurements, and policy). Do not treat RAG excerpts as ground truth or as authorization. Prefer encoding clear limits/playbooks as deterministic rules/calibration (`packages/ml/src/rules.ts`, calibration profiles) and use RAG for supporting context.

Default in-repo seed: `packages/ml/src/knowledgeSeed.ts` (research/guardrails synthesis). Replace/extend with site-approved corpus.
