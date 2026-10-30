// Серверна функція ІІ (Claude Haiku через API): пошук аромату, фото, прогноз, профіль смаку.
// Ключ і workspace — у секретах Supabase (ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID); у застосунок не потрапляють.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-haiku-5-5";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

const workspace = Deno.env.get("ANTHROPIC_WORKSPACE_ID");
const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
  defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : undefined,
});

const textOf = (content: Anthropic.ContentBlock[]) =>
  content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("");

// Модель відповідає JSON-ом у тексті (з веб-пошуком structured outputs не поєднуються)
function parseJson(text: string) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("AI did not return JSON");
  return JSON.parse(text.slice(s, e + 1));
}

// ---------- Пошук аромату ----------

async function lookup(query: string) {
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `Find the perfume "${query}" on fragrantica.com. Return up to 4 matching versions (the original and flankers whose names match the query, e.g. EDT/EDP/Elixir/Eau Fraîche/year editions), most likely first.

Reply with ONLY this JSON, no other text:
{"candidates":[{"name":"","brand":"","year":null,"perfumer":null,"concentration":null,"family":null,"fragrantica_url":"","top_notes":[],"heart_notes":[],"base_notes":[]}]}

Rules: exact perfume page URLs from fragrantica.com (they end with -<number>.html); notes in English, lowercase, as listed on the page; family in English like "Floral", "Fruity Floral", "Woody Amber", "Gourmand"; concentration one of EDC, EDT, EDP, Parfum, Extrait, Oil or null. If nothing matches, return {"candidates":[]}.`,
  }];
  let res: Anthropic.Message | null = null;
  for (let i = 0; i < 3; i++) {
    res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages,
    });
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  const out = parseJson(textOf(res!.content));
  const candidates = (out.candidates ?? []).map((c: Record<string, unknown>) => {
    const id = String(c.fragrantica_url ?? "").match(/-(\d+)\.html/)?.[1] ?? null;
    return { ...c, fragrantica_id: id, image_url: id ? `https://fimgs.net/mdimg/perfume/o.${id}.jpg` : null };
  });
  return { candidates, searches: res!.usage.server_tool_use?.web_search_requests ?? 0 };
}

// Завантажуємо фото флакона у своє сховище (браузер не може забрати його з чужого сайту)
async function saveImage(sb: SupabaseClient, userId: string, fragranticaId: string) {
  if (!/^\d+$/.test(fragranticaId)) throw new Error("Bad id");
  const r = await fetch(`https://fimgs.net/mdimg/perfume/o.${fragranticaId}.jpg`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`Image not found (${r.status})`);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from("photos").upload(path, await r.arrayBuffer(), { contentType: "image/jpeg" });
  if (error) throw error;
  return { path };
}

// ---------- Контекст щоденника для прогнозів і профілю ----------

const KEEP = ["name", "brand", "family", "top_notes", "heart_notes", "base_notes", "rating", "longevity", "sillage",
  "seasons", "would_buy", "review", "reason_note", "price_per_ml", "status"];
const slim = (p: Record<string, unknown>) =>
  Object.fromEntries(KEEP.filter(k => p[k] != null && !(Array.isArray(p[k]) && !(p[k] as unknown[]).length)).map(k => [k, p[k]]));

async function diary(sb: SupabaseClient) {
  const [{ data: perfumes }, { data: terms }, { data: profile }, { data: preds }] = await Promise.all([
    sb.from("perfumes").select("*").order("created_at"),
    sb.from("terms").select("name,smell,description").order("name"),
    sb.from("taste_profile").select("*").maybeSingle(),
    sb.from("predictions").select("perfume_id,rating").eq("status", "done"),
  ]);
  const all = perfumes ?? [];
  const rated = all.filter(p => p.status !== "wishlist" && p.rating != null)
  const misses = (preds ?? []).map(x => {
    const p = rated.find(r => r.id === x.perfume_id)
    return p ? { name: p.name, predicted: x.rating, actual: p.rating } : null
  }).filter(Boolean);
  // Стабільний текст (без дат і випадкового порядку), щоб працювало кешування
  const context = [
    "MY RATED PERFUMES (rating 0–5 stars; my average is low, ~2.2, so 3★ is already good; reviews are in Ukrainian):",
    JSON.stringify(rated.map(slim)),
    "MY GLOSSARY:", JSON.stringify(terms ?? []),
    profile?.profile ? `MY CURRENT TASTE PROFILE:\n${profile.profile}` : "",
    misses.length ? `PAST AI FORECASTS VS MY REAL RATINGS (learn from misses): ${JSON.stringify(misses)}` : "",
  ].filter(Boolean).join("\n\n");
  return { all, rated, context };
}

const ROLE = `You know my perfume diary below. I test 3 ml decants. Write in Ukrainian, addressing me as "ти", short and concrete, in the style of my own reviews. Key patterns to respect: powdery notes (iris, violet, heliotrope, rose) usually disappoint me; sweet perfumes often please at first and then bore me or cause nausea after a few days; warm boozy/woody-vanilla scents for cold weather work best. Judge by how a perfume will likely smell and wear, not by note names alone.`;

async function forecast(sb: SupabaseClient, perfumeId: string) {
  const { all, context } = await diary(sb);
  const p = all.find(x => x.id === perfumeId);
  if (!p) throw new Error("Perfume not found");
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: [{ type: "text", text: ROLE }, { type: "text", text: context, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: `Predict how I will rate and feel about this perfume I haven't rated yet:
${JSON.stringify(slim(p))}

Reply with ONLY JSON: {"rating": number 0.5–5 in 0.5 steps, "confidence": "low"|"medium"|"high", "summary": "3–5 sentences: what I will probably smell, like and dislike, compared with perfumes I rated", "likes": ["2–4 short tags"], "risks": ["2–4 short tags"]}`,
    }],
  });
  const f = parseJson(textOf(res.content));
  const row = {
    perfume_id: perfumeId, status: "done",
    rating: Math.max(0.5, Math.min(5, Math.round(Number(f.rating) * 2) / 2)),
    confidence: ["low", "medium", "high"].includes(f.confidence) ? f.confidence : "medium",
    summary: String(f.summary ?? ""), likes: (f.likes ?? []).map(String), risks: (f.risks ?? []).map(String),
    requested_at: new Date().toISOString(), done_at: new Date().toISOString(),
  };
  const { data, error } = await sb.from("predictions").upsert(row).select().single();
  if (error) throw error;
  return data;
}

async function profile(sb: SupabaseClient) {
  const { rated, context } = await diary(sb);
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: [{ type: "text", text: ROLE }, { type: "text", text: context, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: `Rewrite my taste profile from ALL my reviews (texts matter more than note names). Three short paragraphs in Ukrainian: what I love (with examples), what disappoints me and why, my patterns (seasons, sweetness fatigue, longevity, price).
Reply with ONLY JSON: {"profile": "...", "loves": ["4–7 short Ukrainian tags"], "avoids": ["5–9 short Ukrainian tags"]}`,
    }],
  });
  const f = parseJson(textOf(res.content));
  const { data, error } = await sb.from("taste_profile").upsert({
    profile: String(f.profile), loves: (f.loves ?? []).map(String), avoids: (f.avoids ?? []).map(String),
    based_on: rated.length, refresh_requested: false, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" }).select().single();
  if (error) throw error;
  return data;
}

// ---------- Вхід ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Not signed in" }, 401);
  try {
    const body = await req.json();
    switch (body.action) {
      case "lookup": return json(await lookup(String(body.query ?? "").slice(0, 200)));
      case "image": return json(await saveImage(sb, user.id, String(body.fragrantica_id)));
      case "forecast": return json(await forecast(sb, String(body.perfume_id)));
      case "profile": return json(await profile(sb));
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    if (e instanceof Anthropic.APIError) return json({ error: `AI error ${e.status}: ${e.message}` }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
