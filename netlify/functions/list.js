export default async (request) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const url = new URL(request.url);
    const status = (url.searchParams.get("status") || "all").toLowerCase();

    const nowIso = new Date().toISOString();

    const q = new URL(`${SUPABASE_URL}/rest/v1/marina_codes`);
    q.searchParams.set("select", "code,pedalstar_id,created_at,expires_at,used_at");
    q.searchParams.set("order", "created_at.desc");
    q.searchParams.set("limit", "200");

    if (status === "active") {
      q.searchParams.set("used_at", "is.null");
      q.searchParams.set("expires_at", `gt.${nowIso}`);
    } else if (status === "used") {
      q.searchParams.set("used_at", "not.is.null");
    }

    const r = await fetch(q.toString(), {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });

    const data = await r.text();
    if (!r.ok) return new Response(JSON.stringify({ error: "Supabase failed", detail: data }), { status: 500, headers });

    return new Response(data, { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", detail: String(e) }), { status: 500, headers });
  }
};
