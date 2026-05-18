import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Category = "fullstack" | "backend" | "ml" | "design" | "pm";

export type Case = {
  id: string;
  category: Category;
  jd: string;
  cv: string;
};

const TEST_SET_DIR = join(import.meta.dirname, "test_set");

function categoryOf(id: string): Category {
  const prefix = id.split("_")[0];
  if (prefix === "fullstack" || prefix === "backend" || prefix === "ml" || prefix === "design" || prefix === "pm") {
    return prefix;
  }
  throw new Error(`Unknown category for case id: ${id}`);
}

export function loadCases(): Case[] {
  const files = readdirSync(TEST_SET_DIR).filter((f) => f.endsWith("_jd.md"));
  const ids = files.map((f) => f.replace("_jd.md", "")).sort();
  return ids.map((id) => ({
    id,
    category: categoryOf(id),
    jd: readFileSync(join(TEST_SET_DIR, `${id}_jd.md`), "utf8"),
    cv: readFileSync(join(TEST_SET_DIR, `${id}_cv.md`), "utf8"),
  }));
}
