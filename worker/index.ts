/**
 * Energy Epoch — Cloudflare Worker: static assets + /api (magic-link auth +
 * cloud saves). Dependency-free (Web standards + Web Crypto). Bindings:
 *   ASSETS (static), DB (D1), SAVES (R2).
 * Vars/secrets: RESEND_API_KEY (secret), FROM_EMAIL, APP_URL.
 *
 * Offline-first: the game works fully logged-out (localStorage). Accounts add a
 * profile name + cloud backup of games/maps. Auth is passwordless magic-link:
 *   request → email → confirm page (POST, prefetch-safe) → session cookie.
 */
interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  DB: D1;
  SAVES: R2;
  RESEND_API_KEY: string;
  FROM_EMAIL: string;
  APP_URL: string;
}

// Minimal shapes for the D1/R2 bindings (avoids a workers-types dependency).
interface D1 {
  prepare(sql: string): D1Stmt;
}
interface D1Stmt {
  bind(...v: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface R2 {
  get(key: string): Promise<{ body: ReadableStream } | null>;
  put(key: string, val: ArrayBuffer | ReadableStream): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

const TOKEN_TTL_MS = 15 * 60 * 1000; // magic link valid 15 min
const SESSION_TTL_MS = 60 * 24 * 3600 * 1000; // 60-day rolling session
const COOKIE = "ee_sess";
const enc = new TextEncoder();

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randHex(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function normEmail(e: unknown): string {
  return String(e ?? "").trim().toLowerCase();
}
function validEmail(e: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254;
}
function json(obj: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
function cookieHeader(id: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE}=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
function clearCookieHeader(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
function getSessionId(req: Request): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(/;\s*/)) {
    const [k, v] = part.split("=");
    if (k === COOKIE && v) return v;
  }
  return null;
}

async function currentUser(
  req: Request,
  env: Env,
): Promise<{ id: string; email: string; name: string | null } | null> {
  const sid = getSessionId(req);
  if (!sid) return null;
  const idHash = await sha256hex(sid);
  const row = await env.DB.prepare(
    `SELECT s.user_id AS id, s.expires_at AS exp, u.email, u.name
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = ?`,
  )
    .bind(idHash)
    .first<{ id: string; exp: number; email: string; name: string | null }>();
  if (!row || row.exp < Date.now()) return null;
  return { id: row.id, email: row.email, name: row.name };
}

async function sendMagicLink(env: Env, email: string, link: string): Promise<void> {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: `Energy Epoch <${env.FROM_EMAIL}>`,
      to: [email],
      subject: "Your Energy Epoch sign-in link",
      html: `<p>Tap to sign in to Energy Epoch — this link expires in 15 minutes:</p>
             <p><a href="${link}">Sign in to Energy Epoch</a></p>
             <p>If you didn't request this, ignore this email.</p>`,
    }),
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // Host split: the app subdomain serves the game SPA; the root/apex domain
    // serves the marketing landing page (never the game bundle). /api/* is
    // shared by both (the landing's Sign in and the app both call it).
    if (!url.pathname.startsWith("/api/")) {
      // Prefer the Host header (correct in prod AND under `wrangler dev`, where
      // url.hostname is just 127.0.0.1).
      const host = (req.headers.get("host") ?? url.hostname).toLowerCase();
      const isApp = host.startsWith("app.");
      if (!isApp) {
        // Landing domain: return the marketing page for any navigation; let its
        // own assets (favicon, etc.) pass through to the static bucket. Fetch
        // the EXTENSIONLESS /landing (Cloudflare Assets 307-redirects .html to
        // its extensionless form), and serve it no-store so the apex root can
        // never get pinned to a stale cached game index at the edge.
        const accept = req.headers.get("accept") ?? "";
        if (req.method === "GET" && accept.includes("text/html")) {
          const page = await env.ASSETS.fetch(new Request(new URL("/landing", url).toString()));
          return new Response(page.body, {
            status: page.status,
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
          });
        }
      }
      return env.ASSETS.fetch(req);
    }

    try {
      const now = Date.now();

      // --- POST /api/auth/request { email } -> mint token + email link ---
      if (url.pathname === "/api/auth/request" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as { email?: string };
        const email = normEmail(body.email);
        // Enumeration-safe: always return 200, regardless of validity.
        if (validEmail(email)) {
          const token = randHex(32);
          const hash = await sha256hex(token);
          await env.DB.prepare(
            `INSERT INTO login_tokens (token_hash, email, expires_at, created_at)
             VALUES (?, ?, ?, ?)`,
          )
            .bind(hash, email, now + TOKEN_TTL_MS, now)
            .run();
          // Link points at the STATIC /confirm page (Cloudflare Assets serves
          // that for the navigation click); that page fetch()es /api/auth/consume
          // — a non-navigation POST that actually reaches this Worker (a form
          // submit would be a navigation POST → Assets 405s it).
          const link = `${env.APP_URL}/confirm?token=${token}`;
          await sendMagicLink(env, email, link).catch(() => {});
        }
        return json({ ok: true });
      }

      // --- POST /api/auth/consume { token } -> session cookie (JSON) ---
      if (url.pathname === "/api/auth/consume" && req.method === "POST") {
        const form = await req.formData().catch(() => null);
        const token = String(form?.get("token") ?? "");
        const hash = await sha256hex(token);
        const row = await env.DB.prepare(
          `SELECT email, expires_at, used_at FROM login_tokens WHERE token_hash = ?`,
        )
          .bind(hash)
          .first<{ email: string; expires_at: number; used_at: number | null }>();
        if (!row || row.used_at || row.expires_at < now) {
          return new Response("This sign-in link is invalid or expired.", { status: 400 });
        }
        await env.DB.prepare(`UPDATE login_tokens SET used_at = ? WHERE token_hash = ?`)
          .bind(now, hash)
          .run();
        // Upsert user by email.
        let user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
          .bind(row.email)
          .first<{ id: string }>();
        if (!user) {
          const id = randHex(16);
          await env.DB.prepare(
            `INSERT INTO users (id, email, created_at, last_login) VALUES (?, ?, ?, ?)`,
          )
            .bind(id, row.email, now, now)
            .run();
          user = { id };
        } else {
          await env.DB.prepare(`UPDATE users SET last_login = ? WHERE id = ?`)
            .bind(now, user.id)
            .run();
        }
        const sid = randHex(32);
        await env.DB.prepare(
          `INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
        )
          .bind(await sha256hex(sid), user.id, now + SESSION_TTL_MS, now)
          .run();
        // JSON (not a 302) — the caller is a fetch() from /confirm; the browser
        // still applies Set-Cookie, then the page redirects into the game.
        return json({ ok: true }, 200, { "set-cookie": cookieHeader(sid) });
      }

      // --- GET /api/me ---
      if (url.pathname === "/api/me" && req.method === "GET") {
        const u = await currentUser(req, env);
        return u ? json({ email: u.email, name: u.name }) : json({ error: "unauthorized" }, 401);
      }

      // --- POST /api/logout ---
      if (url.pathname === "/api/logout" && req.method === "POST") {
        const sid = getSessionId(req);
        if (sid) {
          await env.DB.prepare(`DELETE FROM sessions WHERE id_hash = ?`)
            .bind(await sha256hex(sid))
            .run();
        }
        return json({ ok: true }, 200, { "set-cookie": clearCookieHeader() });
      }

      // --- PUT /api/profile { name } ---
      if (url.pathname === "/api/profile" && req.method === "PUT") {
        const u = await currentUser(req, env);
        if (!u) return json({ error: "unauthorized" }, 401);
        const body = (await req.json().catch(() => ({}))) as { name?: string };
        const name = String(body.name ?? "").trim().slice(0, 40);
        await env.DB.prepare(`UPDATE users SET name = ? WHERE id = ?`).bind(name, u.id).run();
        return json({ ok: true, name });
      }

      // --- GET /api/saves -> list of {slot, map, updatedAt} ---
      if (url.pathname === "/api/saves" && req.method === "GET") {
        const u = await currentUser(req, env);
        if (!u) return json({ error: "unauthorized" }, 401);
        const rows = await env.DB.prepare(
          `SELECT slot, map_json AS map, save_version AS v, updated_at AS updatedAt
             FROM saves WHERE user_id = ? ORDER BY updated_at DESC`,
        )
          .bind(u.id)
          .all<{ slot: string; map: string | null; v: number; updatedAt: number }>();
        return json({ saves: rows.results });
      }

      // --- GET/PUT /api/saves/:slot -> the gzip'd game blob (R2) ---
      const m = url.pathname.match(/^\/api\/saves\/([^/]+)$/);
      if (m) {
        const u = await currentUser(req, env);
        if (!u) return json({ error: "unauthorized" }, 401);
        const slot = decodeURIComponent(m[1]).slice(0, 80);
        const key = `${u.id}/${slot}`;
        if (req.method === "GET") {
          const obj = await env.SAVES.get(key);
          if (!obj) return json({ error: "not found" }, 404);
          // Raw gzip bytes (NOT Content-Encoding: gzip — the browser would then
          // auto-decompress and the client's manual gunzip would double-fail).
          return new Response(obj.body, {
            headers: { "content-type": "application/octet-stream" },
          });
        }
        if (req.method === "PUT") {
          const buf = await req.arrayBuffer();
          if (buf.byteLength > 5_000_000) return json({ error: "too large" }, 413);
          await env.SAVES.put(key, buf);
          await env.DB.prepare(
            `INSERT INTO saves (user_id, slot, map_json, save_version, r2_key, size, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(user_id, slot) DO UPDATE SET
               map_json = ?3, save_version = ?4, r2_key = ?5, size = ?6, updated_at = ?7`,
          )
            .bind(
              u.id,
              slot,
              req.headers.get("x-map") ?? null,
              Number(req.headers.get("x-save-version") ?? 0),
              key,
              buf.byteLength,
              now,
            )
            .run();
          return json({ ok: true, updatedAt: now });
        }
      }

      return json({ error: "not found" }, 404);
    } catch {
      return json({ error: "server error" }, 500);
    }
  },
};
