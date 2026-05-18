import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Row = {
  case_id: string;
  category: string;
  bullets_relevance: number;
  bullets_specificity: number;
  cover_letter_relevance: number;
  cover_letter_specificity: number;
  questions_relevance: number;
  questions_specificity: number;
  groundedness_bullets_pass: boolean;
  groundedness_cover_letter_pass: boolean;
  ai_tell_bullets_pass: boolean;
  ai_tell_cover_letter_pass: boolean;
  retries_bullets: number;
  retries_cover_letter: number;
  retries_questions: number;
  latency_ms: number;
  cost_usd: number;
  judge_model: string;
};

const COLUMNS: (keyof Row)[] = [
  "case_id",
  "category",
  "bullets_relevance",
  "bullets_specificity",
  "cover_letter_relevance",
  "cover_letter_specificity",
  "questions_relevance",
  "questions_specificity",
  "groundedness_bullets_pass",
  "groundedness_cover_letter_pass",
  "ai_tell_bullets_pass",
  "ai_tell_cover_letter_pass",
  "retries_bullets",
  "retries_cover_letter",
  "retries_questions",
  "latency_ms",
  "cost_usd",
  "judge_model",
];

export function writeCsv(path: string, rows: Row[]): void {
  const header = COLUMNS.join(",");
  const lines = rows.map((r) =>
    COLUMNS.map((c) => {
      const v = r[c];
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "string") return `"${v.replace(/"/g, '""')}"`;
      return String(v);
    }).join(","),
  );
  writeFileSync(path, [header, ...lines].join("\n") + "\n");
}

export function readCsv(path: string): Row[] {
  const text = readFileSync(path, "utf8").trim();
  const [headerLine, ...lines] = text.split("\n");
  const cols = headerLine.split(",") as (keyof Row)[];
  return lines.map((line) => {
    const values = parseCsvLine(line);
    const row = {} as Row;
    cols.forEach((c, i) => {
      const raw = values[i];
      if (c === "category" || c === "case_id" || c === "judge_model") (row as Record<string, unknown>)[c] = raw.replace(/^"|"$/g, "");
      else if (raw === "true" || raw === "false") (row as Record<string, unknown>)[c] = raw === "true";
      else (row as Record<string, unknown>)[c] = Number(raw);
    });
    return row;
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function findResultBySha(resultsDir: string, sha: string): string | null {
  if (!existsSync(resultsDir)) return null;
  const matches = readdirSync(resultsDir).filter((f) => f.endsWith(`_${sha}.csv`));
  if (matches.length === 0) return null;
  matches.sort();
  return join(resultsDir, matches[matches.length - 1]);
}
