# r/cscareerquestions

**Title:** I built a free tool that tailors your CV bullets, cover letter, and likely interview questions to a specific job posting

**Flair:** Tools (or whichever fits)

**Body:**

Free, no signup, no email gate. https://cible.work

Paste a job URL (or the JD text) plus your CV. About 12 seconds later you get:

- 4–6 tailored CV bullets, each tied to a specific requirement in the JD
- A 150–200 word cover letter with a company-specific opening hook (no "I am excited about your mission" generic stuff)
- 3–5 likely interview questions with hints (mix of technical, behavioral, and company-specific)

A few honest things up front, because this sub deserves it:

- **It's also my portfolio project.** I'm job searching too. I'd rather say that than pretend otherwise.
- **It hallucinates less than the chatbot you'd otherwise paste this into.** There's a deterministic check that every claim in the bullets and cover letter actually appears in your CV (substring match, then word overlap, then embedding similarity). If it can't verify a claim, it rewrites that section once. If it still can't, you see a warning rather than the false claim being hidden.
- **Your inputs go to Anthropic and OpenAI** for the LLM calls. I don't store them on my own server, but those vendors might. Footer on the site says the same.
- **Rate limit:** 10 generations per 24 hours per IP, 3 per hour burst. Should be plenty for normal use; designed to keep my OpenAI bill from killing the project.

If you try it and it produces something useful, I'd love to know. If it produces something bad I'd love to know that even more — there's a "View trace" button on every result that shows the model chain so I can debug.

Happy to answer questions about how it works.
