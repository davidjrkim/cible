import { z } from "zod";
import { recordCopyClicked } from "@/lib/persistence";

export const runtime = "edge";

const BodySchema = z.object({
  type: z.literal("copy_clicked"),
  trace_id: z.string().regex(/^[0-9a-f-]{8,}$/i),
  target: z.enum(["bullets", "cover_letter", "questions"]),
});

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid_request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const recorded = await recordCopyClicked({
    trace_id: parsed.data.trace_id,
    target: parsed.data.target,
    at: Date.now(),
  });
  return new Response(JSON.stringify({ ok: true, recorded }), {
    headers: { "content-type": "application/json" },
  });
}
