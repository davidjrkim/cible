# Why my AI engineering portfolio uses a different vendor as its judge

*A 14-day case study on Cible — a tailored job-application generator that uses Claude to generate and GPT-5 to grade.*

---

## TL;DR

I built [Cible](https://cible.work) in 14 days. It turns a job posting and a CV into a tailored application — bullets, cover letter, likely interview questions — in ~12 seconds.

The product is real, but the load-bearing part of the project is the AI-engineering scaffolding around it. Two decisions made the biggest difference, and both went against the obvious default:

1. **The eval judge is a different model family from the generators.** Claude writes; OpenAI `gpt-5` grades. Self-graded evals inflate in ways that are very hard to catch.
2. **The groundedness check is deterministic, not LLM-judged.** Three tiers — substring → Jaccard → embedding cosine ≥ 0.75 — none of which can hallucinate.

Everything else (prompt caching, parallel writers, the static DAG, the public `/stats` page) is conventional. The two choices above are the only ones I'd defend in a code review.

---

## Hook 1: A cross-family judge

The pitch for this project was "real evals," so I had to be honest about what "real" means.

The instinctive default is to let the same model that generated the output also grade it. It's cheap, it's one less API key, and the prompt is easier. It's also a self-graded exam. A Sonnet-grading-Sonnet eval will produce a tidy number that has limited diagnostic value, because the judge shares the same blind spots, biases, and tells as the writer it's reviewing.

So Cible's judge is OpenAI `gpt-5`, with `gpt-4.1` as a fallback. The generators are Claude Sonnet 4.6 and Haiku 4.5. The judge prompt is committed at [evals/judge_prompt.md](evals/judge_prompt.md) and PR-reviewed — if I change the rubric, the diff is visible.

This is not bias-free. Cross-family judges have their own preferences, and a model that liked verbose justifications would systematically reward the wrong outputs. The mitigation is mechanical: I spot-check 5 cases by hand against the judge's scores, every time the prompt changes. If the judge starts disagreeing with me in a consistent direction, the prompt or the model is the problem, not the candidates.

What this buys me in practice:

- Scores I'm willing to put on a public `/stats` page **with the judge model named**. If a reader thinks gpt-5 is a soft grader, they can discount accordingly. They can't do that with an anonymized "LLM judge."
- A regression gate that means something. The gate is a Wilcoxon signed-rank test on paired relevance scores across the 30-case eval set, blocked if mean delta ≤ -0.2 and p < 0.05, plus a per-case threshold (any single case dropping ≥1.0 on relevance fails). If the judge and the generator were the same family, that statistical machinery would be measuring noise correlated with whatever bias they share.

The cost is mild: an extra API key, an extra dependency, and one more rate limit to worry about. The lesson generalizes — if your product's pitch is that you take evals seriously, don't have the writer grade itself.

## Hook 2: A deterministic groundedness verifier

The other place I refused to use a model is the safety check.

The verifier's job is to catch fabricated facts about the candidate before they reach a recruiter. The temptation is to write a prompt like "is this bullet supported by the CV?" and call it a day. That's circular for the same reason as the self-graded judge — you're asking a model that just hallucinated to detect its own hallucinations. Worse, when it fails it fails confidently, in fluent prose.

So the verifier is deterministic, in three tiers, with each tier cheaper than the next is expensive:

```
claim → substring match → Jaccard ≥ 0.6 → embedding cosine ≥ 0.75
        (free, ~ms)        (free, ~ms)     (one embeddings call)
```

1. **Substring match.** Normalize case and whitespace, then check if the claim appears verbatim in the CV. Most claims pass here — "Rust," "Stripe," "5 years."
2. **Jaccard ≥ 0.6 on tokens.** For paraphrases. Stopwords are stripped; the threshold is calibrated against the eval set.
3. **Embedding cosine ≥ 0.75** with `text-embedding-3-small`, claim against ~3-sentence CV chunks. For semantic matches the first two tiers miss ("led a team" vs "managed 4 engineers").

Only the third tier costs anything, and only for the claims the first two didn't resolve. Code lives in [lib/agents/verifier.ts](lib/agents/verifier.ts).

A claim that fails all three tiers becomes a retry signal. The writer that produced the unsupported claim re-runs once with the failed claims appended as explicit feedback ("the following are not in the CV, drop them"). If it fails again, the user sees a warning rather than a polished-but-fabricated bullet.

The honest disclaimers:

- This catches **fabrications**, not **overstatements**. "Led a team of 4" when the CV says "collaborated with 4 engineers" will probably pass — the words overlap. That's a known limitation; it's noted in the PRD §6.
- The embedding tier has a calibration cost. I had to spot-check the threshold by running the verifier on real CV/output pairs and tuning until the false-positive rate dropped without letting obvious hallucinations through. 0.75 is what worked on this corpus; it is not a universal constant.
- A user could paste a CV that says "I worked at Google" when they didn't, and the verifier would happily pass any output that name-drops Google. The verifier checks grounding in the *provided* CV, not truth in the world. That's a different problem.

## What didn't make it (and why)

Two things I cut, because the 14-day cadence forces honesty:

- **A learned verifier.** A fine-tuned classifier or an LLM-as-verifier with a confidence threshold would catch more semantic mismatches. Too much work for a 14-day MVP, and it would have meant the verifier could itself hallucinate — the exact thing the project was trying to avoid. Deferred to v2.
- **PDF/DOCX upload.** Users have to paste plain text. Adding `pdf-parse` is a half-day; debugging weird PDFs from real users is a week. Deferred.

If I had budgeted 21 days instead of 14 I'd have built the learned verifier as a *second* signal alongside the deterministic one, not a replacement. Both numbers reported on the trace view, and the user sees a warning if either disagrees.

## What the scores actually look like

The 30-case eval set is split 10 full-stack / 10 backend/infra / 5 ML / 5 design+PM. Reference CVs are paired with each JD. Results land as CSV in [evals/results/](evals/results/) and the latest aggregate appears on [/stats](https://cible.work/stats) with the judge model named in plain text. I'd rather show a 4.1 with the judge named than a 4.6 with "LLM-judged" as the only qualifier.

The numbers are what they are. The point of the post is the methodology — that the scores are produced by a judge with no shared interest with the generator, and that the groundedness number is a substring-and-cosine count rather than a model's opinion of itself.

## The lessons that generalize

If you take one thing from this, take this: **the unit of trust in an LLM system is the chain of "who is grading whom?"**. Every time the same model appears on both sides of that line — generating and grading, writing and verifying, retrieving and ranking — you've taken on a correlated error you cannot detect from inside the system. The fix isn't always "use a different model family." Sometimes it's "use a deterministic check." Sometimes it's "have a human in the loop on a sampled subset." But it has to be *something* outside the loop.

Cible is a small project and a portfolio piece. The decisions above are the ones I'd defend in front of an AI engineering team, and the ones that would change my mind about almost any other LLM product I looked at.

---

*Cible is open source: [github.com/davidjrkims/cible](https://github.com/davidjrkims/cible). The PRD ([PRD.md](PRD.md)) walks through every decision in more depth, including the ones I'd make differently next time.*
