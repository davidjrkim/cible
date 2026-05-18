import { GenerateForm } from "@/components/cible/generate-form";

export const metadata = {
  title: "Generate — Cible",
};

export default function GeneratePage() {
  return (
    <main className="flex-1">
      <section className="mx-auto max-w-3xl px-6 pt-16 pb-24">
        <p className="font-mono text-sm text-muted-foreground">cible.work</p>
        <h1 className="mt-2 mb-8 text-3xl font-semibold tracking-tight">
          Aim your application at the job.
        </h1>
        <GenerateForm />
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
