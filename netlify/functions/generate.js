export default async (request) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: "Missing env vars" }), { status: 500, headers });
    }

    const url = new URL(request.url);
    const ps = (url.searchParams.get("ps") || "").toUpperCase().trim(); // PS001 gibi

    if (!/^PS\d{3}$/.test(ps)) {
      return new Response(JSON.stringify({ error: "Invalid pedalstar id. Expected PS001 format." }), { status: 400, headers });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // 1) Aktif (kullanılmamış + süresi geçmemiş) kod varsa aynı kodu döndür
    {
      const q = new URL(`${SUPABASE_URL}/rest/v1/marina_codes`);
      q.searchParams.set("select", "code,pedalstar_id,created_at,expires_at,used_at");
      q.searchParams.set("pedalstar_id", `eq.${ps}`);
      q.searchParams.set("used_at", "is.null");
      q.searchParams.set("expires_at", `gt.${nowIso}`);
      q.searchParams.set("order", "created_at.desc");
      q.searchParams.set("limit", "1");

      const r = await fetch(q.toString(), {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      });

      if (!r.ok) {
        const t = await r.text();
        return new Response(JSON.stringify({ error: "Supabase query failed", detail: t }), { status: 500, headers });
      }

      const rows = await r.json();
      if (rows && rows.length) {
        return new Response(JSON.stringify({ ok: true, reused: true, ...rows[0] }), { status: 200, headers });
      }
    }

    // 2) Yeni kod üret (ps + 5 karakter => PS001-ABCDE)
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // benzer karakterleri çıkardım
    const rand = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    const code = `${ps}-${rand}`;

    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString(); // 30 dk

    const insertBody = [{ code, pedalstar_id: ps, expires_at: expiresAt }];

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/marina_codes`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(insertBody),
    });

    if (!ins.ok) {
      const t = await ins.text();
      return new Response(JSON.stringify({ error: "Insert failed", detail: t }), { status: 500, headers });
    }

    const created = (await ins.json())[0];
    return new Response(JSON.stringify({ ok: true, reused: false, ...created }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", detail: String(e) }), { status: 500, headers });
  }
};
