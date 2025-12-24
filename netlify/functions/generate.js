export default async (request) => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  };

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers });
  }

  const normalizePedalstar = (raw) => {
    let s = (raw || "").trim().toUpperCase();

    // boşlukları temizle (kopyala-yapıştırda araya boşluk girebiliyor)
    s = s.replace(/\s+/g, "");

    // sadece sayı geldiyse PS + 3 hane yap
    if (/^\d{1,3}$/.test(s)) {
      s = "PS" + s.padStart(3, "0");
    }

    // PS1 / PS01 / PS001 gibi geldiyse 3 haneye tamamla
    if (/^PS\d{1,3}$/.test(s)) {
      s = "PS" + s.slice(2).padStart(3, "0");
    }

    return s;
  };

  try {
    const url = new URL(request.url);

    // hem pedalstar hem pedalstar_id kabul et
    const pedalstarRaw =
      url.searchParams.get("pedalstar") ||
      url.searchParams.get("pedalstar_id") ||
      "";

    const pedalstarId = normalizePedalstar(pedalstarRaw);

    if (!/^PS\d{3}$/.test(pedalstarId)) {
      return new Response(
        JSON.stringify({
          error: "Invalid pedalstar id. Expected PS001 format.",
          received: pedalstarRaw,
          normalized: pedalstarId
        }),
        { status: 400, headers }
      );
    }

    // ENV'lerden Supabase bilgileri
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return new Response(
        JSON.stringify({
          error: "Server env missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
        }),
        { status: 500, headers }
      );
    }

    // 6 haneli tek kullanımlık kod üret
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();

    // 10 dakika geçerli
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const payload = {
      pedalstar_id: pedalstarId,
      code: code,
      expires_at: expiresAt
    };

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/marina_codes`, {
      method: "POST",
      headers: {
        ...headers,
        apikey: SERVICE_ROLE,
        authorization: `Bearer ${SERVICE_ROLE}`,
        prefer: "return=representation"
      },
      body: JSON.stringify(payload)
    });

    if (!ins.ok) {
      const t = await ins.text();
      return new Response(
        JSON.stringify({ error: "Insert failed", detail: t }),
        { status: 500, headers }
      );
    }

    const created = (await ins.json())[0];

    return new Response(
      JSON.stringify({
        ok: true,
        pedalstar_id: created.pedalstar_id,
        code: created.code,
        expires_at: created.expires_at
      }),
      { status: 200, headers }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Server error", detail: String(e) }),
      { status: 500, headers }
    );
  }
};
