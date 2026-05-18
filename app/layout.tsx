import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cible — Aim your application at the job",
  description:
    "Turn a job posting and your CV into a tailored application in under 20 seconds. A compound LLM pipeline with a deterministic groundedness check and cross-family evals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="mt-auto border-t px-6 py-6 text-xs text-muted-foreground">
          <p className="mx-auto max-w-3xl">
            Your JD and CV are sent to Anthropic, OpenAI, and our observability
            provider (Helicone), and may be retained per their policies. Don&apos;t
            paste anything you wouldn&apos;t put in a job application.
          </p>
        </footer>
      </body>
    </html>
  );
}
