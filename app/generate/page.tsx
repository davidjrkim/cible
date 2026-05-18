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
    </main>
  );
}
