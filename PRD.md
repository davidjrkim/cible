# PRD: Cible

*Aim your application at the job. A compound LLM pipeline that turns a job posting and your CV into a tailored application in under 20 seconds, with a deterministic groundedness check, a cross-family eval harness, and full call-level observability.*

**Domain:** cible.work
**Owner:** David Kim
**Status:** MVP, target ship date 14 days from start
**Last updated:** 2026-05-15

---

## 1. Problem

Job seekers spend 20-30 minutes per application tailoring their CV, writing a cover letter, and guessing likely interview questions. That math kills application volume. Existing tools are either expensive subscription products (Teal, Kickresume) or generic AI chatbots where the user writes a fresh prompt every time.

The deeper gap: most "AI apply" tools are a single fat prompt against a frontier model. They produce generic output, hallucinate experience the candidate doesn't have, and have no quality measurement. There's room for one that is properly engineered: a staged pipeline with a programmatic groundedness check, a cross-family eval harness, and full call-level observability.

## 2. Target user

Software engineers, designers, and PMs actively job searching, 1-5 years experience, applying to startups and scale-ups. Initial wedge: YC and French Tech applicants, since that's the launch network.

## 3. Success criteria

Product success criteria:

1. 50+ unique users in the first week of launch
2. 200+ total generations before end of June
3. ≥40% of generations result in the user copying at least one output (engagement proxy — instrumented as a `copy_clicked` event tied to the trace_id)
4. ≥15% return rate within 7 days (cookie-based, opt-in)
5. Cross-family eval suite running on every prompt change: mean relevance ≥4.0/5.0, groundedness verifier pass rate ≥95%
6. Public stats page showing real production usage (total gen count, p50/p95 latency, mean cost, latest eval scores)

Portfolio framing is explicit, not hidden: this is also an AI engineering demo. Build quality of evals, groundedness, and observability counts as much to me as raw user count, and the README will say so plainly. Calling that out up front is more credible than dressing a portfolio piece as a startup.

## 4. Core user flow

1. User lands on homepage. Hero, one-sentence value prop, "Try it" CTA above the fold.
2. User clicks Try It. Form: job posting (URL or pasted text), CV (pasted text), "Remove AI tells" toggle.
3. User clicks Generate. Streaming response with stage updates: "Extracting requirements...", "Aligning your CV...", "Drafting cover letter...", "Predicting questions...", "Reviewing quality..."
4. Three result cards render: Tailored CV Bullets, Cover Letter Draft, Likely Interview Questions.
5. Each card has copy-to-clipboard. Cover letter is editable in place.
6. Below the cards, a "View trace" button reveals the agent chain that produced the result: each agent's latency, model used, cost, and quality score.

## 5. System architecture

Cible is a **compound LLM pipeline**: a fixed DAG of prompt calls with a deterministic groundedness check and a cross-family critic. Each step has one job, uses the smallest model that handles it well, and is independently observable.

> Framing note: earlier drafts called this "multi-agent." It isn't. There's no planner, no dynamic routing, no agent-to-agent communication — it's a static DAG with a critic-and-retry loop. "Pipeline" is the honest term and easier to defend in interviews. The word *agent* still appears below as shorthand for "prompt step" because that's how the code is organized under `lib/agents/`.

```
                        User Request (JD + CV + flags)
                                      │
                                      ▼
              ┌─────────────────────────────────────┐
              │ 1. Requirements Extractor           │  Haiku 4.5
              │    raw JD → structured JSON         │  ~$0.001
              └────────────────────┬────────────────┘
                                   │
       ┌───────────────────────────┼────────────────────────────┐
       ▼                           ▼                            ▼
┌──────────────┐         ┌──────────────────┐         ┌─────────────────┐
│ 2. CV        │         │ 3. Cover Letter  │         │ 4. Question     │
│    Aligner   │         │    Writer        │         │    Generator    │
│  (Sonnet)    │         │  (Sonnet)        │         │  (Sonnet)       │
└──────┬───────┘         └────────┬─────────┘         └────────┬────────┘
       │                          │                            │
       ▼                          ▼                            │
┌─────────────────────────────────────────────┐                │
│ 5. Groundedness Verifier (deterministic)    │                │
│    Haiku extracts claims from 2 & 3, then   │                │
│    each claim matched against raw CV via    │                │
│    case-insensitive substring + embedding   │                │
│    cosine ≥ 0.75 (text-embedding-3-small).  │                │
│    Any unsupported claim → retry that step  │                │
│    once with the failed claim as feedback.  │                │
└────────────────┬────────────────────────────┘                │
                 │                                             │
                 └─────────────────────┬───────────────────────┘
                                       ▼
              ┌─────────────────────────────────────┐
              │ 6. Cross-Family Critic              │  GPT-5
              │    scores all four outputs vs.      │  (different
              │    rubric; flags only used for      │   vendor →
              │    telemetry, NOT to gate retries   │   unbiased
              │    (the verifier already did that)  │   score)
              └────────────────┬────────────────────┘
                               ▼
                       User-facing JSON + trace
```

**Why split into stages instead of one prompt:**

- Each step needs different context. The bullet writer needs the structured JD plus the raw CV. The question generator needs the JD plus a summarized CV. One mega-prompt wastes tokens and dilutes attention.
- Failures are isolatable. If cover letters keep coming out generic, the issue is in step 3, not "the prompt." Evals tell you which step to fix.
- Model routing saves cost. Requirements extraction is structured extraction — Haiku. Writing is the cognitive work — Sonnet. Critic is cross-family — GPT-5. Estimated cost per generation: **~$0.04 base, ~$0.07 with one retry, ~$0.10 worst case (retries on both writers).** With prompt caching, cache reads cut input cost ~90% on the CV and structured JD. Without caching, ~$0.07 base.
- **Latency, honestly:** the pipeline is *serial → parallel → serial*. Best case = `t(step1) + max(t(2), t(3), t(4)) + t(verifier) + t(critic)` ≈ 1.5 + 7 + 1.5 + 2.5 = **~12.5s p50**. A single writer retry adds ~7s. Target: **p50 < 12s, p95 < 20s.** Earlier "<10s" claims were wrong — they ignored the serial hops and Vercel's hobby-tier 10s function cap. Fix: deploy on Edge runtime (25s wall clock) and stream stage updates so perceived latency is dominated by time-to-first-token, not time-to-last-byte.

**Context engineering rationale:**

JDs run 2,000+ tokens. CVs run 1,500+. The naive approach (concatenate everything for every step) burns budget and dilutes signal. Instead:

- Step 1 produces a compact structured representation (~300 tokens) that downstream steps consume instead of the raw JD.
- The CV is sent verbatim to steps 2 and 3 because original phrasing matters for bullet rewriting and tone matching.
- Step 4 (question generator) gets a summarized CV (seniority + top 3 skills) because predicting interview questions only needs the high-level signal.
- The critic gets the structured JD + summarized CV + all four outputs to score holistically.
- **Prompt caching** (`cache_control: { type: "ephemeral" }`) is applied to the raw CV and the structured JD blocks, both of which are reused across multiple Sonnet calls in the same request. Anthropic cache reads are ~90% cheaper than fresh input tokens. Without caching, per-generation cost roughly doubles.

## 6. Agent specifications

### Agent 1: Requirements Extractor

- **Model:** `claude-haiku-4-5-20251001`
- **Input:** raw JD text (scraped or pasted)
- **Output JSON shape:**
  ```json
  {
    "company_name": "string",
    "role_title": "string",
    "seniority_signals": ["string"],
    "must_have_skills": ["string"],
    "nice_to_have_skills": ["string"],
    "key_responsibilities": ["string"],
    "tone_indicators": ["string"]
  }
  ```
- **Why Haiku:** structured extraction from clean-ish text is exactly what Haiku is built for. 10x cheaper than Sonnet, accuracy is sufficient.
- **Failure mode:** noisy HTML scrapes produce noisy JSON. Mitigation: Zod schema validation, fallback to "paste the JD as text" if required fields are missing.

### Agent 2: CV Aligner

- **Model:** `claude-sonnet-4-6`
- **Input:** structured JD requirements + raw CV (CV is cached via `cache_control`)
- **Output JSON shape:**
  ```json
  {
    "bullets": [
      { "text": "string", "addresses_requirement": "string", "cv_evidence_span": "string" }
    ]
  }
  ```
  4-6 bullets. `cv_evidence_span` is a substring of the raw CV that supports the bullet. The verifier (step 5) uses it as the first match attempt.
- **Why Sonnet:** this is the IP work; output quality drives product perception.
- **Note on hallucination:** the prompt still instructs "do not invent experience," but the load-bearing guarantee is the deterministic Groundedness Verifier in step 5, not the instruction. A prompt instruction is a wish, not a mechanism.

### Agent 3: Cover Letter Writer

- **Model:** `claude-sonnet-4-6`
- **Input:** structured JD + raw CV (cached) + tone_indicators
- **Output:** 150-200 word cover letter as plain text, plus a sibling JSON array of `cv_evidence_spans` listing the CV substrings supporting each factual claim made about the candidate.
- **Hard constraint in prompt:** opening hook must reference something specific to the company, pulled from the structured JD. No generic "I am excited about your mission."

### Agent 4: Question Generator

- **Model:** `claude-sonnet-4-6`
- **Input:** structured JD + summarized CV
- **Output:** array of 3-5 objects `{ question: string, hint: string, type: "technical" | "behavioral" | "company_specific" }`
- **Validation:** Zod schema enforces shape; a downstream check enforces the type mix (≥1 technical, ≥1 behavioral, ≥1 company_specific). If the mix fails, regenerate once with the missing type called out in the prompt. Allowing 3-5 items rather than "exactly 3" gives the model slack to satisfy the type constraint without contorting.

### Agent 5: Groundedness Verifier (deterministic step, not a free-form LLM judgment)

- **Purpose:** programmatically catch hallucinated experience. This is the load-bearing anti-hallucination mechanism; everything upstream is best-effort.
- **Implementation:**
  1. **Claim extraction** (`claude-haiku-4-5-20251001`, ~$0.0005): take the bullets and cover letter, return a JSON array of factual claims about the candidate (skills, employers, years, projects, achievements). Each claim is the literal phrase used in the output.
  2. **Match against CV** (deterministic, no LLM):
     - First try: case-insensitive substring of the claim in the raw CV.
     - Second try: tokenize the claim and CV, compute Jaccard overlap; pass if ≥0.6 on a noun-phrase basis.
     - Third try: embed the claim and each ~3-sentence CV chunk via `text-embedding-3-small`; pass if max cosine similarity ≥ 0.75.
  3. **Verdict per output:** `{ pass: boolean, unsupported_claims: string[] }`.
- **Retry policy:** if `unsupported_claims.length > 0` for an output, re-run that one writer (step 2 or 3) **once**, with the unsupported claims appended to the prompt as "the following claims were not supported by the CV; remove them or rephrase to stay grounded." Max one retry per output per request to bound cost and latency. The verifier re-runs after the retry; a still-failing output ships with a visible "ungrounded claims detected" warning rather than blocking the response.
- **Why deterministic, not an LLM judge:** LLM "did you hallucinate?" checks are circular (the model that wrote the claim is asked whether the claim is grounded). Embeddings + substring matching against the actual CV are independent evidence.
- **Why it isn't perfect:** the threshold (0.75) will leak some borderline rephrasings and reject some legitimate paraphrases. The verifier is calibrated against the eval set in §7. Treat it as a strong filter, not a proof.

### Agent 6: Cross-Family Critic / Quality Scorer

- **Model:** **OpenAI `gpt-5`** (chosen specifically because it's from a different model family than the generators — using Sonnet to grade Sonnet's output gives a self-graded score and bakes family-correlated bias into the headline metric)
- **Input:** structured JD + summarized CV + all four outputs + the groundedness verifier verdict
- **Output:**
  ```json
  {
    "scores": {
      "bullets":      { "relevance": 1-5, "specificity": 1-5 },
      "cover_letter": { "relevance": 1-5, "specificity": 1-5 },
      "questions":    { "relevance": 1-5, "specificity": 1-5 }
    },
    "groundedness": {
      "bullets":      { "pass": bool, "unsupported_claims": [] },
      "cover_letter": { "pass": bool, "unsupported_claims": [] }
    },
    "notes": "free-text qualitative feedback for the dashboard, not shown to user"
  }
  ```
- **Role of the critic:** *telemetry only*. The critic's scores feed evals and the public stats page; the critic does **not** gate retries (the verifier already handles that). This keeps the runtime path simple and bounds worst-case latency.
- **Why this matters:** without a critic that is independent of the generators, prompt regressions ship silently and the README's quality numbers are self-graded. With a cross-family critic, the score is at least directionally trustworthy.

## 7. Evals

The evals harness is the most important non-user-facing part of this project, and the most credible signal in an AI engineering interview. To be credible the judge must be **independent of the generators** and the regression gate must be **statistically meaningful**.

### Test set

- 30 real job postings curated manually, stored in `evals/test_set/` (target at launch; grow toward 60 post-launch — see "Statistical power" below)
- Coverage: 10 full-stack, 10 backend / infra, 5 ML / AI, 5 design / PM
- Each posting paired with a reference CV (mine or a fictional one written for the eval)
- Stored as `{posting_id}_jd.md` and `{posting_id}_cv.md`
- Cases are tagged so summaries can be sliced by role category (catches "we regressed on ML jobs specifically")

### Cross-family judge prompt

A separate call to **OpenAI `gpt-5`** (or `gpt-4.1` as fallback) evaluates each generation against a rubric. **Deliberately not Sonnet:** using the same model family that generated the output is a self-graded eval and the highest-leverage critique of any eval setup. Cross-family scoring is not bias-free, but it removes the most obvious source of inflation.

Rubric per output:

- **Relevance** (1-5): does the output respond to what the JD specifically asks for?
- **Specificity** (1-5): is the output tailored to this JD, or could it apply to any role?
- **Groundedness** (pass/fail): this field is populated by the deterministic verifier (step 5), not the judge. Reported alongside judge scores for the same generation.
- **AI-tell check** (pass/fail): checks the **pre-postprocessing** model output for forbidden words and em dashes (the post-strip output trivially passes regardless of model behavior — checking it would test the filter, not the model). The eval framework captures both pre- and post-strip output via a callback hook on the generator.

The judge prompt is versioned in `evals/judge_prompt.md` and committed alongside the test set; changes to the judge are themselves PR-reviewed.

### Statistical power and the regression gate

With n=30 ordinal 1-5 scores, the standard error of the mean is roughly 0.15-0.25. A naive "mean drop > 0.2 → block merge" rule is inside the noise band — it both blocks valid changes and lets real regressions through.

Replacement gate, run as `pnpm evals --compare-against=<git_sha>`:

1. **Per-case regression check:** for each of the 30 cases, score both old and new prompts. **Flag if any single case regresses by ≥1.0 on relevance OR groundedness flips from pass → fail.** Per-case regressions are far more informative than aggregate means.
2. **Aggregate paired test:** run a Wilcoxon signed-rank test on the paired (old, new) relevance scores. Block merge if the paired mean delta is ≤ -0.2 **and** p < 0.05. (Wilcoxon over t-test because the scores are ordinal, not continuous.)
3. **Groundedness floor:** verifier pass rate across all 30 cases must be ≥95%. A new prompt that scores higher on relevance but worse on groundedness does not merge.

These are still imperfect — n=30 limits power — but they are honestly engineered rather than statistically pretend.

### Workflow

1. Run `pnpm evals` from repo root (full eval) or `pnpm evals --compare-against=HEAD~1` (regression check)
2. Script iterates the 30 test cases, calls the full Cible pipeline (verifier + critic included), then calls the cross-family judge for each
3. Results write to `evals/results/{timestamp}_{git_sha}.csv` and a paired-comparison JSON if applicable
4. Summary prints: mean relevance and specificity per output type, groundedness pass rate, AI-tell rate (pre-strip), per-category slice scores, cost, latency
5. Pre-merge rule: prompt changes must pass the per-case regression check, the aggregate paired test, and the groundedness floor (see above)

### What the README shows

- Latest eval scores in a small table at the top with the **judge model named explicitly** ("Judge: OpenAI gpt-5 — chosen to be different family from the generators to avoid self-grading.")
- Link to the eval results CSV in the repo so anyone can audit
- A line: "Cible's eval suite runs 30 real job postings through every prompt change. Cross-family judge (OpenAI gpt-5). Current mean relevance: 4.3 / 5. Groundedness verifier pass rate: 97%."

The honesty of *naming the judge model* is the strongest AI engineering signal in the project. Anyone who has run evals at work will read that line and know the author is not bluffing.

## 8. Observability

Every agent call is logged via internal trace storage.

### Per-generation trace (internal)

- Each user request gets a `trace_id` (UUID).
- All 5+ agent calls for that generation share the trace_id, stored in Upstash Redis.
- The user-facing response includes the trace_id so the UI can show "View trace" with the full agent chain.
- Trace view in UI: ordered list of agent calls with truncated inputs, truncated outputs, latency, cost, and quality score.

### Public stats page

- Route: `/stats`
- Shows total generations, generations in the last 24h, mean latency, mean cost, current eval scores
- Updates on page load (no websocket needed for v1)
- Doubles as transparency and a trust signal for new users

## 9. Features in scope (MVP)

- Job posting input: URL or paste text
- CV input: paste only
- Full 6-step pipeline: extractor → 3 parallel writers → deterministic groundedness verifier (with retry on unsupported claims) → cross-family critic for telemetry
- Prompt caching on the raw CV and structured JD
- Streaming response with stage updates via Server-Sent Events
- "Remove AI tells" toggle (banned word list, no em dashes; eval checks pre-strip output)
- Copy to clipboard for each output; `copy_clicked` event instrumented per trace_id (powers the engagement success metric in §3)
- Trace view per generation, including verifier verdicts and critic scores
- Public `/stats` page (totals, p50/p95 latency, mean cost, latest eval scores, judge model named)
- Mobile responsive
- Rate limiting: **10 generations per IP per 24 hours, 3 per hour** (the original 5/24h was too tight for a user iterating their CV and didn't actually defend against abuse since CGNAT shares IPs; the per-hour burst is the real defense)
- Honest privacy footer: "Your JD and CV are sent to Anthropic and OpenAI and may be retained per their policies. Do not paste anything you wouldn't put in a job application."
- Evals harness with 30 test cases, deterministic groundedness verifier, and a cross-family judge prompt

## 10. Out of scope, explicitly

Including the four "AI skills 2026" concepts that don't fit Cible naturally, so it's clear they were considered and rejected, not forgotten.

- **User accounts and saved history** — defer to v2
- **PDF or DOCX CV parsing** — paste only in v1
- **Multimodal (image, audio input)** — Cible is text-in-text-out. Adding image input would be theater, not a real feature.
- **RAG over an external corpus** — no relevant corpus exists. The JD and CV are already in context. Bolting on "rag over a database of good cover letters" is its own scope creep, not a Cible feature.
- **Fine-tuning a base model** — requires data collection, training pipeline, weeks of work. Overkill for a 14-day MVP and deserves its own dedicated project to justify.
- **Browser extension auto-fill** — v2
- **Stripe and paid tier** — v2
- **Multi-language output beyond English** — v2 (French and Korean are obvious next steps)

## 11. Tech stack

**Frontend**
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui

**Backend**
- Next.js API routes deployed on the **Edge runtime** (25s wall-clock limit; needed because the hobby-tier Node serverless cap is 10s and our honest p95 latency target is up to 20s)
- Anthropic SDK (`@anthropic-ai/sdk`) with **prompt caching** enabled (`cache_control: { type: "ephemeral" }`) on the raw CV and structured JD message blocks
- OpenAI SDK (`openai`) for the cross-family critic (eval-time and runtime telemetry) and for `text-embedding-3-small` used by the groundedness verifier
- Models: `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `gpt-5` (critic + judge), `text-embedding-3-small` (verifier)
- Cheerio for HTML parsing of job pages
- Zod for schema validation of every LLM step's output (extractor, writers, critic) — output that fails Zod triggers a single regeneration of that step

**Infrastructure**
- Vercel for hosting (Edge runtime; hobby tier is fine until volume forces an upgrade)
- Upstash Redis for rate limiting and trace storage (free tier)
- Env vars: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

**Evals tooling**
- Plain TypeScript script under `evals/`
- CSV output, no fancy dashboard required
- Optional `evals/dashboard.tsx` page reading the latest CSV, if time permits

**Escape hatch:** if Next.js fights me past day 3, drop back to Vite + React + Express which I already know. Shipped product matters more than trendy stack.

## 12. Data model

V1 needs minimal persistence.

```
Redis keys:
  ratelimit:{ip}    → { count, resetAt }, TTL 24h
  stats:total       → counter, incremented per generation
  stats:24h         → sorted set of timestamps, expired hourly
  trace:{trace_id}  → JSON blob, TTL 7 days (for trace view)
```

V2 (when accounts ship):

```
generations
  id              uuid
  user_id         uuid (nullable for anon)
  job_input       text
  cv_input        text
  outputs_json    jsonb
  trace_json      jsonb
  eval_scores     jsonb
  created_at      timestamp
```

## 13. API contract

**POST /api/generate**

Request:
```json
{
  "jobInput": { "type": "url" | "text", "value": "..." },
  "cv": "pasted CV text",
  "removeAiTells": true
}
```

Response (streaming, server-sent events):
```
event: stage
data: { "stage": "extracting", "agent": "requirements_extractor" }

event: stage
data: { "stage": "aligning", "agent": "cv_aligner" }

... more stage events

event: result
data: {
  "trace_id": "uuid",
  "tailoredBullets": [{ "text": "...", "addresses_requirement": "..." }, ...],
  "coverLetter": "...",
  "likelyQuestions": [{ "question": "...", "hint": "...", "type": "technical" }, ...],
  "groundedness": {
    "bullets":      { "pass": true,  "unsupported_claims": [] },
    "cover_letter": { "pass": true,  "unsupported_claims": [] }
  },
  "scores": {
    "judge_model": "gpt-5",
    "bullets":      { "relevance": 4.5, "specificity": 4.0 },
    "cover_letter": { "relevance": 4.0, "specificity": 4.5 },
    "questions":    { "relevance": 4.5, "specificity": 4.0 }
  },
  "retries": { "bullets": 0, "cover_letter": 1, "questions": 0 },
  "totalLatencyMs": 11400,
  "totalCostUsd": 0.051
}
```

**GET /api/trace/:trace_id**

Returns the full agent chain for a generation.

**GET /api/stats**

Returns aggregate metrics for the public `/stats` page.

Response codes:
- 200: success (may include `groundedness.pass: false` if retries didn't resolve unsupported claims — the UI shows a warning rather than failing the request)
- 429: rate limit exceeded
- 422: could not extract requirements (suggest pasting JD text)
- 500: pipeline failure (with trace_id for debugging)
- 504: Edge function timed out (>25s) — retry with a shorter CV or report

## 14. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Job sites block scraping | High | Medium | Fallback to paste-text. Clear UI message. |
| API costs run away | Medium | High | Per-IP rate limit (10/24h, 3/h burst). Hard daily spend cap in Anthropic + OpenAI consoles. Haiku for extractor and verifier claim-extraction. Prompt caching on shared blocks. |
| Self-graded headline metric | Was Medium | High | **Fixed:** judge model is OpenAI `gpt-5`, a different family from the generators. README names the judge explicitly. Not bias-free, but no longer self-graded. |
| Hallucinated experience ships to users | Medium | High | **Fixed:** deterministic Groundedness Verifier (substring + Jaccard + embedding cosine) catches claims not supported by the CV. Independent evidence, not a self-check. Calibrated against the eval set. |
| Verifier rejects legitimate paraphrases (false positives) | Medium | Low | Threshold tunable per output type. Retry prompt asks writer to rephrase using exact CV language. If retry still fails, ship with a visible warning rather than blocking the request. |
| Cross-family judge has its own bias | Medium | Medium | Judge prompt is committed and PR-reviewed. Periodically spot-check 5 cases by hand and compare to judge scores. Document the discrepancy in the README. |
| Latency feels slow | Medium | Medium | Stream stage updates so perceived latency is time-to-first-token, not time-to-last-byte. Parallelize steps 2/3/4. Honest p50 target ~12s, p95 ~20s — communicate this rather than promising <10s and disappointing. |
| Vercel Edge function timeout (25s) | Low | High | Edge runtime gives us 25s vs hobby Node 10s. Worst case (both writers retry) is still under 20s. If we breach, return partial result with `groundedness.pass: false` warning. |
| Output quality is generic | Medium | High | Evals harness with 30 postings, per-case regression check, Wilcoxon paired test. Iterate prompts until mean relevance > 4.0 and groundedness pass rate ≥95% before launch. |
| Time overruns past 14 days | Medium | Medium | Drop the in-app trace view. UI polish slips before evals or groundedness. |
| Nobody uses it | Medium | Low | Launch on r/cscareerquestions, Indie Hackers, LinkedIn, Hacker News, French Tech Slack groups. 30+ users floor is achievable. |
| Privacy concerns | Was Medium | Medium | **Fixed (honestly):** footer states that JDs and CVs are sent to Anthropic and OpenAI and may be retained per their policies. No false "7-day TTL" claim. Users self-redact if needed. |

## 15. 14-day plan

Reordered so the eval scaffold lands **before** the agents it judges. The original plan built evals on day 7-8, after agents were already shipped — meaning days 4-5 of prompt iteration had no instrumentation. That's backwards for a project whose pitch is "real evals."

**Day 1: Scaffold and deploy**
- Init Next.js + TypeScript + Tailwind + shadcn on the Edge runtime
- Add Anthropic SDK + prompt caching config, OpenAI SDK, Zod, Upstash Redis client
- Deploy a static landing page to Vercel
- Confirm cible.work resolves correctly, HTTPS works

**Day 2: Eval scaffold first (5 cases, judge prompt, runner)**
- Build the `pnpm evals` runner with a stub pipeline
- Write the cross-family judge prompt (`evals/judge_prompt.md`) using OpenAI gpt-5
- Curate the first 5 test cases (one per role category as a smoke test)
- CSV output, paired-comparison harness, per-case regression check, Wilcoxon hook
- The runner exists before agents do — every prompt iteration from day 3 onward is measured

**Day 3: Input flow and scraping**
- Form component with URL/text toggle and CV textarea
- Cheerio scraper with graceful fallback when blocked
- Server route stub that accepts the form and returns mock data
- Wire up Upstash rate limiting (10/24h, 3/h burst)

**Day 4: Writers (agents 1-3)**
- Agent 1: requirements extractor (Haiku) with Zod schema validation
- Agent 2: CV aligner (Sonnet) with `cv_evidence_span` field
- Agent 3: cover letter writer (Sonnet) with `cv_evidence_spans` array
- Prompt caching wired up for CV and structured JD
- Trace ID propagation across all agent calls
- Run evals on the 5-case set after each prompt iteration

**Day 5: Question generator + critic**
- Agent 4: question generator (Sonnet) with 3-5 questions and type mix validation
- Agent 6: cross-family critic (gpt-5) — telemetry only, does not gate retries
- Wire critic output into eval CSV

**Day 6: Groundedness Verifier (this is the load-bearing safety mechanism, give it a day)**
- Claim-extraction step (Haiku) on bullets and cover letter
- Deterministic matcher: substring → Jaccard → embedding cosine
- Retry policy: one retry per writer per request with failed claims as feedback
- Calibrate the 0.75 cosine threshold against the 5-case eval set; record false positive / false negative rates
- Verifier outputs into trace and into the API response

**Day 7: Orchestration and streaming**
- API route runs the full DAG: extractor → parallel(writers) → verifier → critic
- Server-sent events for stage updates
- Validate honest latency target: p50 < 12s, p95 < 20s on a hot cache
- Confirm Edge runtime stays under the 25s cap even with retries

**Day 8: Expand the eval set to 30 cases and iterate**
- Add the remaining 25 cases (10 full-stack, 10 backend, 5 ML, 5 design/PM)
- Run baseline; iterate prompts until mean relevance > 4.0 and groundedness pass rate ≥95%
- Commit eval scores to README with the judge model named explicitly

**Day 9: Observability and stats**
- Verify trace storage captures all calls cleanly with correct trace IDs (Anthropic + OpenAI)
- Build `/stats` public page (totals, p50/p95 latency, mean cost, latest eval scores, judge model)
- Build trace view UI behind "View trace" button on result cards — show verifier verdicts and per-step latency/cost

**Day 10-11: UI polish, AI-tells toggle, instrumentation**
- Result cards with copy buttons (fire `copy_clicked` event tied to trace_id), inline edit on cover letter
- Loading states with rotating stage messages
- Error handling for all failure modes including 504 (Edge timeout) and `groundedness.pass: false` warning UI
- Mobile responsive pass
- Implement "Remove AI tells" toggle; eval framework checks **pre-strip** output for banned tokens (catches the model actually changing behavior, not just the filter doing its job)

**Day 12: Launch prep**
- Write README with eval scores, screenshots, architecture diagram, demo link, **judge model explicitly named**
- Honest privacy footer
- Record 60-second Loom demo highlighting the verifier and cross-family critic
- Add "Selected Projects" section to CV linking to cible.work
- Soft launch to 5 friends, fix anything broken

**Day 13: Public launch**
- Post on r/cscareerquestions, Indie Hackers, LinkedIn, Hacker News (Show HN), French Tech Slack groups
- DM 10 job-searching contacts
- Monitor errors, costs, latency p50/p95, groundedness pass rate

**Day 14: Stabilize and write the case study**
- Fix any bugs from post-launch traffic
- Write a blog post: **"Why my AI engineering portfolio uses a different vendor as its judge."** The cross-family judge story plus the deterministic groundedness verifier are the two strongest hooks — lead with them.

## 16. Launch checklist

Pre-public-launch, all must be true:

- [ ] cible.work resolves to the deployed app, HTTPS works
- [ ] Happy path generates a quality result for 5 different real job postings
- [ ] Rate limiting verified working (spam test) — 10/24h, 3/h burst
- [ ] "Remove AI tells" toggle visibly changes **pre-strip model output** (not just the filter doing its job)
- [ ] Trace storage captures every step call (Anthropic and OpenAI) with correct trace IDs
- [ ] `/stats` page displays real numbers, p50/p95 latency, and **names the judge model**
- [ ] Trace view button reveals the full chain including verifier verdict and critic scores
- [ ] README has: screenshot, architecture diagram, eval scores **with judge model named**, demo link, install instructions
- [ ] Loom demo recorded and embedded in README; mentions the cross-family judge and the deterministic verifier as the two distinguishing features
- [ ] GitHub repo is public, no API keys in commits (check twice — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)
- [ ] Honest privacy footer present (Anthropic + OpenAI may retain inputs)
- [ ] At least one friend has used it and given honest feedback
- [ ] Mean eval relevance score is above 4.0 (cross-family judge, gpt-5)
- [ ] Groundedness verifier pass rate is ≥95% on the 30-case eval set
- [ ] Per-case regression check passes vs the previous prompt baseline
- [ ] Worst-case latency (both writers retry) measured and verified under the Edge runtime 25s cap

## 17. v2 roadmap

In rough order of likely value:

1. User accounts and saved generation history
2. PDF and DOCX CV upload (parse with pdf-parse)
3. Browser extension that auto-fills the form from the active LinkedIn/job page
4. Multi-language output (French and Korean given my background)
5. Interview prep flashcards generated from the likely questions
6. Paid tier at $5/month: unlimited generations, saved history, multi-language

The job hunt is the v1 distribution channel. If Cible helps me land a Paris role, that becomes the v2 case study.

---

*End of PRD. Update this file as scope evolves. Keep the "in scope" list short and the "out of scope" list explicit, especially when tempted to add an AI concept just to check a box.*
