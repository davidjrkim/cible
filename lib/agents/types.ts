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

export const QuestionTypeSchema = z.enum(["technical", "behavioral", "company_specific"]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const QuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        hint: z.string().min(1),
        type: QuestionTypeSchema,
      }),
    )
    .min(3)
    .max(5),
});
export type Questions = z.infer<typeof QuestionsSchema>;

export const CriticVerdictSchema = z.object({
  scores: z.object({
    bullets: z.object({ relevance: z.number().min(1).max(5), specificity: z.number().min(1).max(5) }),
    cover_letter: z.object({ relevance: z.number().min(1).max(5), specificity: z.number().min(1).max(5) }),
    questions: z.object({ relevance: z.number().min(1).max(5), specificity: z.number().min(1).max(5) }),
  }),
  notes: z.string(),
});
export type CriticVerdict = z.infer<typeof CriticVerdictSchema>;

export type AgentTrace = {
  step: string;
  model: string;
  latency_ms: number;
  cost_usd: number;
  retries: number;
};
