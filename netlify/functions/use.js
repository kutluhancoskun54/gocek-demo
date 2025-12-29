export default async (request) => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-admin-token",
  };

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

    if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_TOKEN) {
      return new Response(
        JSON.stringify({ ok: false, error: "Server env missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ADMIN_TOKEN)." }),
        { status: 500, headers }
      );
    }

    const url = new URL(request.url);

    // token: Authorization Bearer | x-admin-token | ?token=
    const auth = request.headers.get("authorization") || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const xToken = (request.headers.get("x-admin-token") || "").trim();
    const qToken = (url.searchParams.get("token") || url.searchParams.get("admin_token") || "").trim();
    const token = (bearer || xToken || qToken || "").trim();

    if (!token || token !== ADMIN_TOKEN) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers });
    }

    // code: ?code=XXXXXX  (GET)  | body { code }
    let code = (url.searchParams.get("code") || "").trim().toUpperCase();
    if (!code && request.method !== "GET") {
      const body = await request.json().catch(() => ({}));
      code = String(body.code || "").trim().toUpperCase();
    }
    if (!code) {
      return new Response(JSON.stringify({ ok: false, error: "Missing code" }), { status: 400, headers });
    }

    const TABLE = "marina_codes";
    const nowIso = new Date().toISOString();

    const commonHeaders = {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
    };

    // 1) row oku
    const selectUrl = new URL(`${SUPABASE_URL}/rest/v1/${TABLE}`);
    selectUrl.searchParams.set("select", "code,pedalstar_id,created_at,expires_at,used_at");
    selectUrl.searchParams.set("code", `eq.${code}`);
    selectUrl.searchParams.set("limit", "1");

    const selRes = await fetch(selectUrl.toString(), { method: "GET", headers: commonHeaders });
    const selText = await selRes.text();
    let rows = [];
    try { rows = JSON.parse(selText); } catch { rows = []; }

    if (!selRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: `Select failed (${selRes.status})`, detail: selText }), { status: 500, headers });
    }
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Code not found" }), { status: 404, headers });
    }

    const row = rows[0];

    // expires kontrol (varsa)
    if (row.expires_at) {
      const exp = new Date(row.expires_at).getTime();
      const now = Date.now();
      if (!Number.isNaN(exp) && exp <= now) {
        return new Response(JSON.stringify({ ok: false, error: "Code expired", row }), { status: 400, headers });
      }
    }

    // zaten kullanılmış mı
    if (row.used_at) {
      return new Response(JSON.stringify({ ok: true, already_used: true, rows: [row] }), { status: 200, headers });
    }

    // 2) used_at set et (PATCH) ve güncel satırı döndür
    const patchUrl = new URL(`${SUPABASE_URL}/rest/v1/${TABLE}`);
    patchUrl.searchParams.set("code", `eq.${code}`);

    const patchRes = await fetch(patchUrl.toString(), {
      method: "PATCH",
      headers: {
        ...commonHeaders,
        Prefer: "return=representation",
      },
      body: JSON.stringify({ used_at: nowIso }),
    });

    const patchText = await patchRes.text();
    let updated = [];
    try { updated = JSON.parse(patchText); } catch { updated = []; }

    if (!patchRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: `Update failed (${patchRes.status})`, detail: patchText }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ ok: true, rows: updated && updated.length ? updated : [{ ...row, used_at: nowIso }] }), {
      status: 200,
      headers,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "Server error", detail: String(e?.message || e) }), { status: 500, headers });
  }
};
