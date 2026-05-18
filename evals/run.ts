import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadCases } from "./cases.ts";
import { runPipeline } from "./pipeline.ts";
import { judgeOutput } from "./judge.ts";
import { writeCsv, readCsv, findResultBySha, type Row } from "./csv.ts";
import { wilcoxonSignedRank } from "./stats.ts";

const RESULTS_DIR = join(import.meta.dirname, "results");

type Args = { compareAgainst: string | null };

function parseArgs(argv: string[]): Args {
  let compareAgainst: string | null = null;
  for (const a of argv.slice(2)) {
    if (a.startsWith("--compare-against=")) compareAgainst = a.split("=", 2)[1];
  }
  return { compareAgainst };
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "nogit";
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const cases = loadCases();
  console.log(`Loaded ${cases.length} cases.`);

  const rows: Row[] = [];
  for (const c of cases) {
    const t0 = Date.now();
    const out = await runPipeline(c);
    const verdict = await judgeOutput(c, out);
    const elapsed = Date.now() - t0;
    rows.push({
      case_id: c.id,
      category: c.category,
      bullets_relevance: verdict.scores.bullets.relevance,
      bullets_specificity: verdict.scores.bullets.specificity,
      cover_letter_relevance: verdict.scores.cover_letter.relevance,
      cover_letter_specificity: verdict.scores.cover_letter.specificity,
      questions_relevance: verdict.scores.questions.relevance,
      questions_specificity: verdict.scores.questions.specificity,
      groundedness_bullets_pass: verdict.groundedness.bullets.pass,
      groundedness_cover_letter_pass: verdict.groundedness.cover_letter.pass,
      ai_tell_bullets_pass: verdict.ai_tell_check.bullets.pass,
      ai_tell_cover_letter_pass: verdict.ai_tell_check.cover_letter.pass,
      retries_bullets: out.retries.bullets,
      retries_cover_letter: out.retries.cover_letter,
      retries_questions: out.retries.questions,
      latency_ms: out.total_latency_ms || elapsed,
      cost_usd: out.total_cost_usd,
      judge_model: verdict.judge_model,
    });
    console.log(
      `  ${c.id.padEnd(14)} bullets=${verdict.scores.bullets.relevance}/${verdict.scores.bullets.specificity} ` +
        `cover=${verdict.scores.cover_letter.relevance}/${verdict.scores.cover_letter.specificity} ` +
        `q=${verdict.scores.questions.relevance}/${verdict.scores.questions.specificity} ` +
        `g=${verdict.groundedness.bullets.pass && verdict.groundedness.cover_letter.pass ? "pass" : "FAIL"}`,
    );
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const sha = gitSha();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = join(RESULTS_DIR, `${ts}_${sha}.csv`);
  writeCsv(csvPath, rows);
  console.log(`\nWrote ${csvPath}`);

  printSummary(rows);

  if (args.compareAgainst) {
    const exit = comparePairwise(args.compareAgainst, rows);
    process.exit(exit);
  }
}

function printSummary(rows: Row[]) {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const pct = (xs: boolean[]) => (xs.filter(Boolean).length / Math.max(1, xs.length)) * 100;
  const relAll = [
    ...rows.map((r) => r.bullets_relevance),
    ...rows.map((r) => r.cover_letter_relevance),
    ...rows.map((r) => r.questions_relevance),
  ];
  const specAll = [
    ...rows.map((r) => r.bullets_specificity),
    ...rows.map((r) => r.cover_letter_specificity),
    ...rows.map((r) => r.questions_specificity),
  ];
  const groundedness = rows.flatMap((r) => [r.groundedness_bullets_pass, r.groundedness_cover_letter_pass]);
  console.log("\n=== summary ===");
  console.log(`  n=${rows.length}`);
  console.log(`  mean relevance:     ${mean(relAll).toFixed(2)}`);
  console.log(`  mean specificity:   ${mean(specAll).toFixed(2)}`);
  console.log(`  groundedness pass:  ${pct(groundedness).toFixed(1)}%`);
  console.log(`  mean latency:       ${mean(rows.map((r) => r.latency_ms)).toFixed(0)}ms`);
  console.log(`  mean cost:          $${mean(rows.map((r) => r.cost_usd)).toFixed(4)}`);

  const byCat = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push(r);
  }
  console.log("  per-category mean relevance:");
  for (const [cat, rs] of byCat) {
    const r = [...rs.map((r) => r.bullets_relevance), ...rs.map((r) => r.cover_letter_relevance), ...rs.map((r) => r.questions_relevance)];
    console.log(`    ${cat.padEnd(10)} ${mean(r).toFixed(2)}  (n=${rs.length})`);
  }
}

function comparePairwise(sha: string, newRows: Row[]): number {
  const oldPath = findResultBySha(RESULTS_DIR, sha);
  if (!oldPath) {
    console.error(`\nERROR: no prior result CSV matches sha=${sha} in ${RESULTS_DIR}`);
    return 2;
  }
  const oldRows = readCsv(oldPath);
  const oldById = new Map(oldRows.map((r) => [r.case_id, r]));

  console.log(`\n=== paired comparison vs ${sha} (${oldPath}) ===`);

  type Flag = { case_id: string; reason: string };
  const flags: Flag[] = [];
  const oldRelevance: number[] = [];
  const newRelevance: number[] = [];

  for (const n of newRows) {
    const o = oldById.get(n.case_id);
    if (!o) {
      flags.push({ case_id: n.case_id, reason: "no matching baseline row" });
      continue;
    }
    const fields: (keyof Row)[] = ["bullets_relevance", "cover_letter_relevance", "questions_relevance"];
    for (const f of fields) {
      const delta = (n[f] as number) - (o[f] as number);
      if (delta <= -1.0) flags.push({ case_id: n.case_id, reason: `${f} dropped by ${delta} (${o[f]} → ${n[f]})` });
    }
    if (o.groundedness_bullets_pass && !n.groundedness_bullets_pass) flags.push({ case_id: n.case_id, reason: "groundedness_bullets flipped pass → fail" });
    if (o.groundedness_cover_letter_pass && !n.groundedness_cover_letter_pass) flags.push({ case_id: n.case_id, reason: "groundedness_cover_letter flipped pass → fail" });

    oldRelevance.push(o.bullets_relevance, o.cover_letter_relevance, o.questions_relevance);
    newRelevance.push(n.bullets_relevance, n.cover_letter_relevance, n.questions_relevance);
  }

  const wilcoxon = wilcoxonSignedRank(oldRelevance, newRelevance);
  console.log(`  per-case regressions: ${flags.length}`);
  for (const f of flags) console.log(`    ${f.case_id}: ${f.reason}`);
  console.log(
    `  Wilcoxon paired: n=${wilcoxon.n_nonzero}/${wilcoxon.n} mean_delta=${wilcoxon.mean_delta.toFixed(3)} z=${wilcoxon.z.toFixed(2)} p=${wilcoxon.p_two_sided.toFixed(4)}`,
  );

  const newGroundednessRate =
    newRows.flatMap((r) => [r.groundedness_bullets_pass, r.groundedness_cover_letter_pass]).filter(Boolean).length /
    (newRows.length * 2);
  console.log(`  groundedness pass rate: ${(newGroundednessRate * 100).toFixed(1)}%`);

  // Gate (PRD §7).
  const perCaseRegression = flags.length > 0;
  const aggregateRegression = wilcoxon.mean_delta <= -0.2 && wilcoxon.p_two_sided < 0.05;
  const groundednessFloorBreached = newGroundednessRate < 0.95;

  const jsonPath = join(RESULTS_DIR, `compare_${gitSha()}_vs_${sha}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify(
      { baseline_sha: sha, baseline_csv: oldPath, wilcoxon, flags, groundedness_pass_rate: newGroundednessRate },
      null,
      2,
    ),
  );
  console.log(`  wrote ${jsonPath}`);

  if (perCaseRegression || aggregateRegression || groundednessFloorBreached) {
    console.error(
      `\nGATE FAIL: per_case=${perCaseRegression} aggregate=${aggregateRegression} groundedness_floor=${groundednessFloorBreached}`,
    );
    return 1;
  }
  console.log("\nGATE PASS");
  return 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
