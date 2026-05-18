# Show HN

**Title:** Show HN: Cible – a tailored job application generator with a cross-family LLM judge

**URL:** https://cible.work

**Text:**

Hi HN. Cible takes a job posting and a CV, returns tailored CV bullets, a cover letter, and likely interview questions in ~12s. Free, no signup.

What I actually wanted to build, and what makes this worth posting here, is the AI-engineering scaffolding around it:

- **Compound pipeline, not one fat prompt.** Static DAG: Haiku 4.5 extracts the JD into structured JSON, three Sonnet 4.6 writers run in parallel against it (CV is cached via `cache_control` so the second and third writers don't re-pay for it), a deterministic groundedness verifier checks every factual claim against the raw CV, and only then does a critic score the output.
- **The groundedness verifier is deterministic on purpose.** It extracts claims with Haiku, then matches each one against the CV via case-insensitive substring → Jaccard ≥ 0.6 → embedding cosine ≥ 0.75 (`text-embedding-3-small`). Asking the same family of model "did you hallucinate?" is circular. Failing claims trigger one retry of that writer with the failed claims fed back as feedback.
- **The eval judge is from a different vendor.** OpenAI `gpt-5` scores Anthropic-generated output. Using Sonnet to grade Sonnet inflates scores in a way that's hard to detect. Cross-family isn't bias-free but it removes the worst source. Judge prompt is in the repo and PR-reviewed.
- **Regression gate is statistical, not a vibes check.** Per-case threshold (any case dropping ≥1.0 on relevance fails), Wilcoxon signed-rank on paired relevance across the 30-case set, and a 95% groundedness pass-rate floor.
- **/stats is public.** Real p50/p95 latency, mean cost per generation, and the latest eval scores with the judge model named. Trace view per generation shows the verifier verdict and per-step latency/cost.

I'm explicit in the README that this is also a portfolio piece — I'd rather say that than dress a portfolio project as a startup. If you're an AI engineer the eval harness and the deterministic verifier are the interesting parts; if you're job searching the tool itself works.

Stack: Next.js 15 on Vercel Edge, Anthropic + OpenAI, Helicone for observability, Upstash Redis for rate limiting.

Repo: [github link]. Happy to answer questions on the verifier calibration, the judge prompt, or the cost numbers.
