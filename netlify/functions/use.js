export default async (request) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    if (request.method === "OPTIONS") return new Response("", { status: 204, headers });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body = await request.json().catch(() => ({}));
    const code = (body.code || "").toUpperCase().trim();

    if (!code) return new Response(JSON.stringify({ error: "Missing code" }), { status: 400, headers });

    // Kodu getir
    const q = new URL(`${SUPABASE_URL}/rest/v1/marina_codes`);
    q.searchParams.set("select", "code,pedalstar_id,created_at,expires_at,used_at");
    q.searchParams.set("code", `eq.${code}`);
    q.searchParams.set("limit", "1");

    const r = await fetch(q.toString(), {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "Fetch failed", detail: t }), { status: 500, headers });
    }

    const rows = await r.json();
    if (!rows.length) return new Response(JSON.stringify({ error: "Code not found" }), { status: 404, headers });

    const row = rows[0];
    const now = new Date();
    if (row.used_at) return new Response(JSON.stringify({ error: "Already used", row }), { status: 409, headers });
    if (new Date(row.expires_at) <= now) return new Response(JSON.stringify({ error: "Expired", row }), { status: 410, headers });

    // used_at işaretle
    const patch = await fetch(`${SUPABASE_URL}/rest/v1/marina_codes?code=eq.${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ used_at: now.toISOString() }),
    });

    if (!patch.ok) {
      const t = await patch.text();
      return new Response(JSON.stringify({ error: "Update failed", detail: t }), { status: 500, headers });
    }

    const updated = (await patch.json())[0];
    return new Response(JSON.stringify({ ok: true, updated }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", detail: String(e) }), { status: 500, headers });
  }
};
