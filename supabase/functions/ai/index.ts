// AI Edge Function (Claude Haiku via the API): lookup, photo, forecast, taste profile, scan, note explanations, picks.
// Key and workspace are Supabase secrets (ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID); they never reach the app.
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

// The model replies with JSON in text (structured outputs don't combine with web search)
function parseJson(text: string) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("AI did not return JSON");
  return JSON.parse(text.slice(s, e + 1));
}

// ---------- Perfume lookup ----------

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

// Copy the bottle photo into our Storage (the browser can't fetch it from another site)
async function saveImage(sb: SupabaseClient, userId: string, fragranticaId: string) {
  if (!/^\d+$/.test(fragranticaId)) throw new Error("Bad id");
  const r = await fetch(`https://fimgs.net/mdimg/perfume/o.${fragranticaId}.jpg`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`Image not found (${r.status})`);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from("photos").upload(path, await r.arrayBuffer(), { contentType: "image/jpeg" });
  if (error) throw error;
  return { path };
}

// ---------- Photo / screenshot recognition ----------

async function scan(image: string, mediaType: string) {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: image } },
        { type: "text", text: `This is a photo or screenshot with perfumes: a shop page, a wishlist, bottles, or a handwritten diary page (Ukrainian).
List every distinct perfume you can identify. Reply with ONLY JSON:
{"items":[{"brand":"","name":"","concentration":null,"price_per_ml":null,"rating10":null,"review":null}]}
Rules: brand and name as the official perfume name in Latin letters (fix typos, e.g. "Gucchi" → "Gucci"); concentration only if visible (EDT, EDP, Parfum, Extrait); price_per_ml only if a price per 1 ml is shown (number); rating10 and review only for handwritten diary pages (copy the review text exactly, in Ukrainian). If nothing is recognizable, return {"items":[]}.` },
      ],
    }],
  });
  return parseJson(textOf(res.content));
}

// ---------- Note passport: how it smells ----------

async function explainNote(sb: SupabaseClient, note: string) {
  const lang = await language(sb);
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `Explain the perfume note "${note}" to a perfume lover who is learning. Write in ${lang}, addressing her informally, simply and vividly.
Reply with ONLY JSON: {"kind": "note"|"molecule"|"accord", "smell": "1–2 sentences: what it actually smells like, with everyday comparisons", "description": "2–4 sentences: what it is (natural/synthetic, where it comes from), how it behaves in perfumes, which notes it is often paired with, 2–3 well-known perfumes where it is prominent"}`,
    }],
  });
  const f = parseJson(textOf(res.content));
  const row = {
    name: note, kind: ["note", "molecule", "accord"].includes(f.kind) ? f.kind : "note",
    smell: String(f.smell ?? ""), description: String(f.description ?? ""), ai_status: null,
  };
  const { data: existing } = await sb.from("terms").select("id").ilike("name", note).maybeSingle();
  const q = existing ? sb.from("terms").update(row).eq("id", existing.id) : sb.from("terms").insert(row);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data;
}

// ---------- Diary context for forecasts and profile ----------

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
  // Stable text (no dates, fixed order) so prompt caching works
  const context = [
    "MY RATED PERFUMES (rating 0–5 stars; my average is low, ~2.2, so 3★ is already good; reviews are in Ukrainian):",
    JSON.stringify(rated.map(slim)),
    "MY GLOSSARY:", JSON.stringify(terms ?? []),
    profile?.profile ? `MY CURRENT TASTE PROFILE:\n${profile.profile}` : "",
    misses.length ? `PAST AI FORECASTS VS MY REAL RATINGS (learn from misses): ${JSON.stringify(misses)}` : "",
  ].filter(Boolean).join("\n\n");
  return { all, rated, context };
}

// Output language comes from user_settings (changed on the site in Settings)
async function language(sb: SupabaseClient) {
  const { data } = await sb.from("user_settings").select("ai_language, display_name").maybeSingle();
  const lang = String(data?.ai_language || "Ukrainian").slice(0, 40);
  const name = String(data?.display_name ?? "").trim().slice(0, 40);
  return name ? `${lang} (my name is ${name})` : lang;
}
const role = (lang: string) => `You know my perfume diary below. I test 3 ml decants. Write in ${lang}, addressing me informally (as a friend), short and concrete, in the style of my own reviews. Key patterns to respect: powdery notes (iris, violet, heliotrope, rose) usually disappoint me; sweet perfumes often please at first and then bore me or cause nausea after a few days; warm boozy/woody-vanilla scents for cold weather work best. Judge by how a perfume will likely smell and wear, not by note names alone.`;

async function forecast(sb: SupabaseClient, perfumeId: string, withReviews = false) {
  const [{ all, context }, lang] = await Promise.all([diary(sb), language(sb)]);
  const p = all.find(x => x.id === perfumeId);
  if (!p) throw new Error("Perfume not found");
  // With reviews: the model first searches the web for what people say about the perfume (~2–4¢ instead of <1¢)
  const reviewsTask = withReviews
    ? `\n\nFirst search the web for what people say about this exact perfume (Fragrantica reviews and main accords, Parfumo, Reddit, blogs): which notes dominate, is it powdery, cloying or sweet, longevity and sillage. Weigh these real impressions more than the note list, and mention in the summary what reviews say when it matters for me.`
    : "";
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `Predict how I will rate and feel about this perfume I haven't rated yet:
${JSON.stringify(slim(p))}${reviewsTask}

Reply with ONLY JSON: {"rating": number 0.5–5 in 0.5 steps, "confidence": "low"|"medium"|"high", "summary": "3–5 sentences: what I will probably smell, like and dislike, compared with perfumes I rated", "likes": ["2–4 short tags"], "risks": ["2–4 short tags"]}`,
  }];
  let res: Anthropic.Message | null = null;
  for (let i = 0; i < 3; i++) {
    res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: withReviews ? 6000 : 3000,
      system: [{ type: "text", text: role(lang) }, { type: "text", text: context, cache_control: { type: "ephemeral" } }],
      ...(withReviews ? { tools: [{ type: "web_search_20250305" as const, name: "web_search" as const, max_uses: 3 }] } : {}),
      messages,
    });
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  const f = parseJson(textOf(res!.content));
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
  const [{ rated, context }, lang] = await Promise.all([diary(sb), language(sb)]);
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: [{ type: "text", text: role(lang) }, { type: "text", text: context, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: `Rewrite my taste profile from ALL my reviews (texts matter more than note names). Three short paragraphs in ${lang}: what I love (with examples), what disappoints me and why, my patterns (seasons, sweetness fatigue, longevity, price).
Reply with ONLY JSON: {"profile": "...", "loves": ["4–7 short tags in ${lang}"], "avoids": ["5–9 short tags in ${lang}"]}`,
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

// ---------- Discover picks ----------

async function recommend(sb: SupabaseClient, query: string, perfumeId: string | null) {
  const [{ all, context }, lang] = await Promise.all([diary(sb), language(sb)]);
  const base = perfumeId ? all.find(p => p.id === perfumeId) : null;
  const known = all.map(p => `${p.brand ?? ""} ${p.name}`.trim()).join("; ");
  const ask = base
    ? `Find perfumes similar to this one from my diary (but NOT already in my diary): ${JSON.stringify(slim(base))}${query ? `\nExtra wishes: ${query}` : ""}`
    : query;
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `${ask}

Search the web (fragrantica.com is best) and suggest 5–8 real perfumes I have NOT tried. Perfumes already in my diary (exclude them): ${known}
Use my reviews and taste profile: avoid what I dislike, explain honestly where the risk is.

Reply with ONLY JSON:
{"items":[{"name":"","brand":"","year":null,"family":null,"concentration":null,"fragrantica_url":"","top_notes":[],"heart_notes":[],"base_notes":[],"why":"2–3 sentences in ${lang} addressed to me informally: why it fits my request and taste, compared with perfumes I rated","risk":"1 sentence in ${lang} or null","match":"high"|"medium"|"low"}]}
Notes in English lowercase. fragrantica_url must be an exact perfume page URL ending with -<number>.html.`,
  }];
  let res: Anthropic.Message | null = null;
  for (let i = 0; i < 4; i++) {
    res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: [{ type: "text", text: role(lang) }, { type: "text", text: context, cache_control: { type: "ephemeral" } }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
      messages,
    });
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  const out = parseJson(textOf(res!.content));
  const items = (out.items ?? []).map((c: Record<string, unknown>) => {
    const id = String(c.fragrantica_url ?? "").match(/-(\d+)\.html/)?.[1] ?? null;
    return { ...c, fragrantica_id: id, image_url: id ? `https://fimgs.net/mdimg/perfume/o.${id}.jpg` : null };
  });
  const { data, error } = await sb.from("recommend_requests").insert({
    query: query || (base ? `Similar to ${base.brand ?? ""} ${base.name}`.trim() : ""), perfume_id: base?.id ?? null,
    status: "done", items, done_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;
  return data;
}

// ---------- Entry point ----------

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
      case "forecast": return json(await forecast(sb, String(body.perfume_id), body.with_reviews === true));
      case "profile": return json(await profile(sb));
      case "recommend": return json(await recommend(sb, String(body.query ?? "").slice(0, 600), body.perfume_id ? String(body.perfume_id) : null));
      case "scan": return json(await scan(String(body.image), String(body.media_type ?? "image/jpeg")));
      case "explain_note": return json(await explainNote(sb, String(body.note ?? "").slice(0, 80)));
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    if (e instanceof Anthropic.APIError) return json({ error: `AI error ${e.status}: ${e.message}` }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
