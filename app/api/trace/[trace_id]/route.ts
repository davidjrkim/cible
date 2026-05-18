import { getTrace } from "@/lib/persistence";

export const runtime = "edge";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ trace_id: string }> },
) {
  const { trace_id } = await params;
  if (!/^[0-9a-f-]{8,}$/i.test(trace_id)) {
    return new Response(JSON.stringify({ error: "invalid_trace_id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const trace = await getTrace(trace_id);
  if (!trace) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify(trace), {
    headers: { "content-type": "application/json", "cache-control": "private, max-age=60" },
  });
}
