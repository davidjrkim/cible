# Cible

*Aim your application at the job.* A compound LLM pipeline that turns a job posting and a CV into a tailored application — bullets, cover letter, likely interview questions — in under 20 seconds, with a deterministic groundedness check and a cross-family eval harness.

**Live:** [cible.work](https://cible.work) (in development)

## Architecture

A static DAG of prompt steps, not a "multi-agent" system:

```
JD + CV
   │
   ▼
[1] Extractor (Haiku 4.5)  ──►  structured JD JSON
   │
   ├──────────────┬──────────────┐         (parallel, prompt-cached)
   ▼              ▼              ▼
[2] CV aligner  [3] Cover     [4] Question
   (Sonnet 4.6)   letter         generator
                  (Sonnet 4.6)   (Sonnet 4.6)
   │              │              │
   └──────────────┴──────────────┘
                  │
                  ▼
        [5] Groundedness verifier  ── retry once on fail ──┐
            substring → Jaccard → embedding cosine ≥ 0.75  │
            (text-embedding-3-small)                       │
                  │ ◄─────────────────────────────────────┘
                  ▼
        [6] Cross-family critic (OpenAI gpt-5)
            telemetry only — does NOT gate retries
                  │
                  ▼
              Result + trace
```

1. **Requirements extractor** (Claude Haiku 4.5) — JD → structured JSON
2. **CV aligner** (Claude Sonnet 4.6) — tailored bullets with `cv_evidence_span`
3. **Cover letter writer** (Claude Sonnet 4.6) — 150-200 words, company-specific hook
4. **Question generator** (Claude Sonnet 4.6) — 3-5 typed interview questions
5. **Groundedness verifier** — deterministic: substring → Jaccard → embedding cosine ≥ 0.75 (`text-embedding-3-small`). Retry once with failed claims as feedback.
6. **Cross-family critic** (OpenAI gpt-5) — telemetry only; does NOT gate retries

Steps 2-4 run in parallel. Prompt caching applied to the raw CV and structured JD blocks across the parallel writers.

See [PRD.md](PRD.md) for the full design rationale, or [case-study.md](case-study.md) for the post-launch write-up on the two load-bearing decisions (cross-family judge + deterministic verifier).

## Evals

**Judge model: OpenAI `gpt-5`.** Deliberately not Sonnet — using the same family that generated the output would be a self-graded eval. Cross-family is not bias-free, but it removes the most obvious source of inflation.

- **Test set:** 30 real job postings paired with reference CVs ([evals/test_set/](evals/test_set/)). Categories: 10 full-stack, 10 backend/infra, 5 ML, 5 design/PM
- **Rubric per output:** relevance (1-5), specificity (1-5), groundedness pass/fail (from the deterministic verifier, not the judge), AI-tell check on pre-strip output
- **Regression gate** (`pnpm evals --compare-against=<git_sha>`):
  1. **Per-case:** flag any single case dropping ≥1.0 on relevance OR groundedness pass → fail
  2. **Aggregate:** Wilcoxon signed-rank on paired relevance; block if mean delta ≤ -0.2 and p < 0.05
  3. **Groundedness floor:** verifier pass rate ≥ 95% across all 30 cases
- **Judge prompt** is versioned at [evals/judge_prompt.md](evals/judge_prompt.md) and PR-reviewed
- **Results** write to [evals/results/](evals/results/) as CSV — public so anyone can audit

Latest aggregate scores will appear here once the 30-case baseline runs. Run `pnpm evals` from repo root to generate.

## Stack

Next.js 15 (Edge runtime) · TypeScript · Anthropic SDK with prompt caching · OpenAI SDK (critic + judge + embeddings) · Helicone (observability proxy) · Upstash Redis (rate limiting + trace storage) · Zod (schema-validated outputs)

## Privacy

Your JD and CV are sent to Anthropic, OpenAI, and our observability provider (Helicone) and may be retained per their policies. Do not paste anything you wouldn't put in a job application.
