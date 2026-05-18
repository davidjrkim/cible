export { extractRequirements, type ExtractorResult } from "./extractor";
export { alignCv, type AlignerResult } from "./aligner";
export { writeCoverLetter, type CoverLetterResult } from "./cover_letter";
export { generateQuestions, type QuestionGenResult } from "./questions";
export { critique, type CriticInput, type CriticResult } from "./critic";
export type {
  AgentTrace,
  Requirements,
  Bullets,
  CoverLetter,
  Questions,
  QuestionType,
  CriticVerdict,
} from "./types";
export type { TraceMeta, Usage } from "./client";
