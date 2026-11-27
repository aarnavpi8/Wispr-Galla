// Forwards /api/* to the FastAPI backend, so the browser only ever talks to port 3000.
// API_URL is read at request time: http://api:8000 in Docker, http://localhost:8000 locally.

const API_URL = process.env.API_URL ?? "http://localhost:8000";

async function proxy(request: Request, ctx: RouteContext<"/api/[...path]">) {
  const { path } = await ctx.params;
  const url = new URL(request.url);
  const target = `${API_URL}/api/${path.join("/")}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  try {
    const hasBody = !["GET", "HEAD"].includes(request.method);
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
    // fetch() already decoded the body, so drop headers that describe the raw bytes.
    const out = new Headers(res.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    return new Response(res.body, { status: res.status, headers: out });
  } catch {
    return Response.json(
      { detail: "Backend not reachable. Is the API server running?" },
      { status: 502 },
    );
  }
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
