import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex-1">
      <section className="mx-auto flex max-w-3xl flex-col items-start gap-8 px-6 pt-24 pb-16 sm:pt-32">
        <p className="font-mono text-sm text-muted-foreground">cible.work</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Aim your application at the job.
        </h1>
        <p className="text-lg text-muted-foreground sm:text-xl">
          Paste a job posting and your CV. Get tailored bullets, a cover
          letter, and likely interview questions in under 20 seconds — with a
          deterministic groundedness check so nothing gets invented.
        </p>
        <div className="flex items-center gap-4">
          <Button asChild size="lg">
            <Link href="/generate">Try it</Link>
          </Button>
          <Link
            href="/stats"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View live stats →
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-3">
          <Feature
            title="Compound pipeline"
            body="Six prompt steps, each with the smallest model that handles its job. Not a single fat prompt."
          />
          <Feature
            title="Grounded by construction"
            body="A deterministic verifier matches every claim back to your CV via substring, Jaccard, and embedding cosine."
          />
          <Feature
            title="Cross-family evals"
            body="OpenAI gpt-5 judges Claude output. No self-grading. Eval scores are public."
          />
        </div>
      </section>

      <footer className="mt-auto border-t px-6 py-6 text-xs text-muted-foreground">
        <p className="mx-auto max-w-3xl">
          Your JD and CV are sent to Anthropic, OpenAI, and our observability
          provider (Helicone), and may be retained per their policies. Don&apos;t
          paste anything you wouldn&apos;t put in a job application.
        </p>
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
