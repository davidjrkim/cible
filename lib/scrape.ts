import * as cheerio from "cheerio";

export type ScrapeResult =
  | { ok: true; text: string; source_url: string }
  | { ok: false; reason: "fetch_failed" | "blocked" | "empty"; status?: number };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function scrapeJobPosting(url: string): Promise<ScrapeResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
  } catch {
    return { ok: false, reason: "fetch_failed" };
  }

  if (!res.ok) {
    const reason = res.status === 403 || res.status === 401 || res.status === 429 ? "blocked" : "fetch_failed";
    return { ok: false, reason, status: res.status };
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, svg, form").remove();

  const candidates = [
    'main', 'article', '[role="main"]',
    '.job-description', '#job-description',
    '.posting', '.content', 'section',
  ];
  let text = "";
  for (const sel of candidates) {
    const t = $(sel).text().replace(/\s+/g, " ").trim();
    if (t.length > text.length) text = t;
  }
  if (text.length < 200) text = $("body").text().replace(/\s+/g, " ").trim();
  if (text.length < 200) return { ok: false, reason: "empty" };

  return { ok: true, text: text.slice(0, 20000), source_url: url };
}
