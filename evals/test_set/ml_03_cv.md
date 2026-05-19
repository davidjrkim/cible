# David Kim

Applied AI engineer, 4 years. London (open to SF).
davidjrkims@example.com · github.com/davidjrkims · cible.work

## Experience

### Founding Engineer, Cible (2026 — present)

- Designed and built Cible, a compound LLM pipeline for tailored job applications: requirements extractor (Haiku) → 3 parallel writers (Sonnet) → deterministic groundedness verifier → cross-family critic (gpt-5) for telemetry
- Built the eval harness: 30 real job postings, cross-family OpenAI gpt-5 judge (specifically not Sonnet, to avoid self-graded scores), Wilcoxon signed-rank regression gate on paired prompt versions
- Wrote the deterministic groundedness verifier (substring → Jaccard → `text-embedding-3-small` cosine) — calibrated against the eval set, not against the model that wrote the claim

### Senior Engineer, Scale AI (2023 — 2025)

- Built the eval-harness service that data-labeling teams used to compare base-model + RLHF + fine-tune variants for customer projects
- Owned the prompt-iteration tooling used by ~40 internal ML engineers; introduced paired-version diff scoring with statistical significance gating
- Shipped a structured-output (tool-use) feature for a customer enterprise pipeline; took mean output-shape-conformance from 87% to >99% with a Zod-validated retry-once policy

### Software Engineer, Stripe (2020 — 2023)

- Built internal tooling for the Issuing product (TypeScript on Stripe's RPC framework)

## Skills

Python, TypeScript, Anthropic API + prompt caching, OpenAI API, eval harnesses (paired Wilcoxon, per-case regression gating, cross-family judges), structured outputs (Zod + tool use), retrieval / embeddings, Pinecone

## Education

B.S. Computer Science, Imperial College London, 2020
