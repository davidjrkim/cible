# Indie Hackers

**Title:** Shipped Cible in 14 days: a job-application tailoring tool with a real eval harness

**Body:**

Live: https://cible.work — free, no signup.

What it does: paste a JD + your CV, get tailored bullets, a cover letter, and likely interview questions in ~12s.

What I actually want to talk about here is the build, because IH has more builder-shaped feedback than user-shaped feedback:

**Day-by-day cadence.** 14 days from `git init` to live. One commit per day, public history. The PRD is in the repo; I treated it as a contract with myself rather than a doc to be ignored.

**Eval scaffold before the agents.** Day 2 was the eval runner — a stub pipeline, the judge prompt, and 5 test cases — and it existed before any agent prompts did. Every prompt iteration from day 3 onward was measured against it. Anyone shipping LLM features without this loses the ability to know whether their changes are actually improvements.

**Cross-vendor judge.** The judge model is OpenAI gpt-5; the writers are Anthropic Sonnet 4.6. Self-graded evals (same family scoring its own output) inflate scores in a way that's hard to detect. Different vendor is the cheap, obvious fix. Not bias-free, but a lot less biased.

**Deterministic groundedness check.** The hallucination problem is the one bit I refused to delegate to another LLM call. Each factual claim in the output is matched against the raw CV via substring → word-overlap → embedding cosine. If it fails, that writer retries once with the failed claim as feedback. Numbers are in the README.

**Public observability.** /stats has real p50/p95, real mean cost per generation, real eval scores. Trace view on every result shows the chain.

**What I'd do differently:** I underestimated how much time the eval set curation eats. Day 8 was supposed to expand the set from 5 to 30 cases and iterate prompts — it ate a day and a half. The 5-case scaffold was good for the early loop but couldn't tell me whether prompt iterations actually generalized.

**Costs so far:** ~$80 in API spend during dev, almost entirely the eval runs. Per-generation cost in prod is ~$0.04 base.

Stack: Next.js 15 on Vercel Edge, Anthropic + OpenAI, Helicone, Upstash Redis.

Happy to answer anything about the eval setup, the prompt-caching wins (cache reads cut input cost ~90% on the CV across the parallel writers), or the day-13 launch nerves.
