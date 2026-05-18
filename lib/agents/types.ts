import { z } from "zod";

export const RequirementsSchema = z.object({
  company_name: z.string().min(1),
  role_title: z.string().min(1),
  seniority_signals: z.array(z.string()),
  must_have_skills: z.array(z.string()),
  nice_to_have_skills: z.array(z.string()),
  key_responsibilities: z.array(z.string()),
  tone_indicators: z.array(z.string()),
});
export type Requirements = z.infer<typeof RequirementsSchema>;

export const BulletsSchema = z.object({
  bullets: z
    .array(
      z.object({
        text: z.string().min(1),
        addresses_requirement: z.string().min(1),
        cv_evidence_span: z.string().min(1),
      }),
    )
    .min(3)
    .max(8),
});
export type Bullets = z.infer<typeof BulletsSchema>;

export const CoverLetterSchema = z.object({
  cover_letter: z.string().min(1),
  cv_evidence_spans: z.array(z.string().min(1)),
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

export type AgentTrace = {
  step: string;
  model: string;
  latency_ms: number;
  cost_usd: number;
  retries: number;
};
