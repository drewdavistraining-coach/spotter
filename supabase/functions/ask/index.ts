// Ask Spotter — the only part of the app that talks to Claude.
//
// It exists so the API key never ships to a phone. The app sends the question plus a brief about the
// client; this function checks who's asking, counts it against a daily cap, and forwards it to Claude
// with the key that lives here as a secret.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function named "ask", paste this file.
// Secrets it needs: ANTHROPIC_API_KEY (from console.anthropic.com).
// Run supabase/ask.sql once first — that creates the daily counter.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = Deno.env.get("ASK_MODEL") ?? "claude-haiku-4-5";
const DAILY_LIMIT = Number(Deno.env.get("ASK_DAILY_LIMIT") ?? 40);
const MAX_OUTPUT_TOKENS = 1500;
const MAX_PROMPT_CHARS = 60_000; // a brief far bigger than this is a bug, not a question

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "Ask Spotter isn't set up yet: ANTHROPIC_API_KEY is missing." }, 500);

  // Supabase has already verified this token; we pass it on so the usage counter is per account.
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization) return json({ error: "Sign in to use Ask Spotter." }, 401);

  let body: { system?: string; messages?: { role: string; content: string }[]; maxTokens?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Could not read that request." }, 400);
  }

  const messages = (body.messages ?? []).filter(m => m?.content?.trim());
  if (!messages.length) return json({ error: "Nothing to ask." }, 400);

  const size = (body.system ?? "").length + messages.reduce((n, m) => n + m.content.length, 0);
  if (size > MAX_PROMPT_CHARS) return json({ error: "That question carries too much history to send." }, 413);

  // Count it against today's allowance before spending anything.
  const usage = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/bump_ask_usage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      Authorization: authorization,
    },
    body: JSON.stringify({ p_limit: DAILY_LIMIT }),
  });

  if (!usage.ok) {
    const detail = await usage.text();
    console.error("usage check failed", usage.status, detail);
    return json({ error: "Couldn't check today's usage. Has supabase/ask.sql been run?" }, 500);
  }

  const [allowance] = await usage.json();
  if (!allowance?.allowed) {
    return json({ error: `That's ${allowance?.daily_limit ?? DAILY_LIMIT} questions today — Ask Spotter is back tomorrow.` }, 429);
  }

  const claude = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: Math.min(body.maxTokens ?? 1200, MAX_OUTPUT_TOKENS),
      system: body.system ?? "",
      messages: messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    }),
  });

  if (!claude.ok) {
    const detail = await claude.text();
    console.error("claude error", claude.status, detail);
    const friendly = claude.status === 401
      ? "The Anthropic key was rejected — check ANTHROPIC_API_KEY."
      : claude.status === 429
        ? "Claude is rate limiting right now. Try again in a moment."
        : claude.status === 400 && detail.includes("credit")
          ? "That Anthropic account is out of credit."
          : "Claude couldn't answer that just now.";
    return json({ error: friendly }, claude.status);
  }

  const reply = await claude.json();
  const text = (reply.content ?? [])
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("\n")
    .trim();

  return json({
    text,
    usedToday: allowance.used,
    dailyLimit: allowance.daily_limit,
    usage: reply.usage ?? null,
  });
});
