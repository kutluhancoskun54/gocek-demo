export default async (request) => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-admin-token"
  };

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || "").trim();

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({
        error: "Server env missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
      }), { status: 500, headers });
    }

    const url = new URL(request.url);

    // token: Authorization Bearer > x-admin-token > ?token=
    const auth = request.headers.get("authorization") || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const xToken = request.headers.get("x-admin-token") || "";
    const qToken = url.searchParams.get("token") || url.searchParams.get("admin_token") || "";
    const token = (qToken || xToken || bearer || "").trim();

    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    // Opsiyonel filtreler
    const pedalstarRaw = (url.searchParams.get("pedalstar") || url.searchParams.get("pedalstar_id") || "").trim().toUpperCase();
    const codeRaw = (url.searchParams.get("code") || "").trim().toUpperCase();

    const qs = new URLSearchParams();
    qs.set("select", "code,pedalstar_id,created_at,expires_at,used_at");
    qs.set("order", "created_at.desc");
    qs.set("limit", "50");

    if (pedalstarRaw) qs.append("pedalstar_id", `eq.${encodeURIComponent(pedalstarRaw)}`);
    if (codeRaw) qs.append("code", `eq.${encodeURIComponent(codeRaw)}`);

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/marina_codes?${qs.toString()}`, {
      method: "GET",
      headers: {
        ...headers,
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`
      }
    });

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: "List failed", detail: t }), { status: 500, headers });
    }

    const rows = await resp.json();
    return new Response(JSON.stringify({ ok: true, rows }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", detail: String(e) }), { status: 500, headers });
  }
};
