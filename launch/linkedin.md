# LinkedIn

Long-form post. Personal voice. Skip the emojis and the "🚀 thrilled to announce" register.

---

**Body:**

Shipped Cible today: a free tool that turns a job posting and your CV into a tailored application in about 12 seconds — bullets, cover letter, and likely interview questions.

https://cible.work

Two reasons I built it.

The selfish one: I'm job searching, and rewriting bullets and cover letters by hand is the part of applying that I procrastinate hardest on. Even a generic AI chatbot helps, but you end up writing the same prompt every time and the output reads like every other AI cover letter on the recruiter's desk.

The technical one: most "AI apply" tools are a single prompt against a frontier model. They hallucinate experience the candidate doesn't have, and there's no measurement of output quality. I wanted to build one properly:

- A staged pipeline where each step has one job and uses the smallest model that handles it well.
- A deterministic groundedness check — every factual claim in the output is matched against the raw CV programmatically, not by asking another LLM "did you hallucinate?". If a claim can't be verified, the writer rewrites that section once with the failed claim fed back in.
- A cross-vendor eval judge: OpenAI scores Anthropic-generated output, so the headline quality numbers aren't self-graded.
- Public observability at cible.work/stats — real latency, real cost per generation, real eval scores.

The README spells out that this is also a portfolio piece. I'd rather say that up front than dress it as a startup. The eval harness and the verifier are the parts I'm proud of.

If you're job searching, give it a try and tell me where it falls down — there's a "View trace" button on each result that helps me debug. If you're hiring AI engineers in Paris or NY, you've now seen 14 days of my work in public.

Repo: [github link]
