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
  /** Optional; defaults to https://admin.playenergyepoch.com */
  ADMIN_URL?: string;
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
/** Only this account can view admin.playenergyepoch.com /api/admin/*. */
const ADMIN_EMAIL = "john.fodchuk@gmail.com";
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
function json(
  obj: unknown,
  status = 200,
  extra?: HeadersInit,
): Response {
  const headers = new Headers(extra);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Response(JSON.stringify(obj), { status, headers });
}

/** Set-Cookie must use Headers#append (plain objects can drop it in Workers). */
function jsonWithCookie(
  obj: unknown,
  cookie: string,
  status = 200,
): Response {
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(obj), { status, headers });
}
function requestHost(req: Request): string {
  return (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
}
/**
 * Share session across app. / admin. / apex on production only.
 * Intentional: admin dashboard and app share one login. Tradeoff: any
 * *.playenergyepoch.com host can receive the cookie — keep subdomains trusted.
 */
function cookieDomainAttr(req: Request): string {
  const host = requestHost(req);
  // Only widen when the request is already on our known production hosts.
  if (
    host === "playenergyepoch.com" ||
    host === "app.playenergyepoch.com" ||
    host === "admin.playenergyepoch.com"
  ) {
    return "; Domain=.playenergyepoch.com";
  }
  return "";
}
function cookieHeader(id: string, req: Request): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  // Host-only first (reliable on app.). Also set Domain= for admin cross-subdomain
  // via a second Set-Cookie when on production hosts — see cookieHeaderPair.
  return `${COOKIE}=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
function cookieHeaderWithDomain(id: string, req: Request): string | null {
  const dom = cookieDomainAttr(req);
  if (!dom) return null;
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE}=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}${dom}`;
}
function appendSessionCookies(headers: Headers, sid: string, req: Request): void {
  headers.append("Set-Cookie", cookieHeader(sid, req));
  const withDom = cookieHeaderWithDomain(sid, req);
  if (withDom) headers.append("Set-Cookie", withDom);
}
function clearCookieHeader(req: Request): string {
  // Clear host-only; domain clear is separate if needed.
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** One-time post-login codes so the game page can re-attach the session cookie. */
async function ensureHandoffTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS auth_handoffs (
       code_hash TEXT PRIMARY KEY,
       session_id TEXT NOT NULL,
       expires_at INTEGER NOT NULL
     )`,
  ).run();
}
function isAdminEmail(email: string): boolean {
  return normEmail(email) === ADMIN_EMAIL;
}
function adminBase(env: Env): string {
  return env.ADMIN_URL || "https://admin.playenergyepoch.com";
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

    // Host split:
    //   app.*     → game SPA
    //   admin.*   → admin dashboard (signups); gated by /api/admin/*
    //   apex      → marketing landing (never the game bundle)
    // /api/* shared across hosts.
    if (!url.pathname.startsWith("/api/")) {
      const host = requestHost(req);
      const isApp = host.startsWith("app.");
      const isAdmin = host.startsWith("admin.");
      const path = url.pathname.replace(/\/$/, "") || "/";
      const staticHtml = async (asset: string) => {
        const page = await env.ASSETS.fetch(new Request(new URL(asset, url).toString()));
        return new Response(page.body, {
          status: page.status,
          headers: {
            "content-type": "text/html; charset=utf-8",
            // Kill browser + CF edge HTML caching (stale SPA shells looked like “old builds”).
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
            "cdn-cache-control": "no-store",
            "cloudflare-cdn-cache-control": "no-store",
            "x-ee-build": "532d9b9",
          },
        });
      };

      // Magic-link landing — all hosts; confirm.html redirects to app./admin. absolutely.
      if (
        req.method === "GET" &&
        (path === "/confirm" || path === "/confirm.html")
      ) {
        return staticHtml("/confirm.html");
      }

      // App host: never edge-cache the SPA shell (stale index → “old build”).
      if (isApp && req.method === "GET" && (path === "/" || path === "/index.html")) {
        return staticHtml("/index.html");
      }

      if (isAdmin && req.method === "GET") {
        // All other admin navigations → dashboard shell (auth checked in-page via API).
        if (path === "/" || path === "/admin" || path === "/admin.html" || path === "/index.html") {
          return staticHtml("/admin.html");
        }
        // favicon etc.
        return env.ASSETS.fetch(req);
      }

      if (!isApp && !isAdmin) {
        // Landing domain: apex root always marketing; privacy is a real page.
        if (req.method === "GET" && (path === "/" || path === "/landing" || path === "/landing.html")) {
          // File on disk is public/landing.html → dist/landing.html (no extensionless asset).
          return staticHtml("/landing.html");
        }
        const accept = req.headers.get("accept") ?? "";
        if (
          req.method === "GET" &&
          accept.includes("text/html") &&
          (path === "/privacy" || path === "/privacy.html")
        ) {
          return staticHtml("/privacy.html");
        }
      }
      return env.ASSETS.fetch(req);
    }

    try {
      const now = Date.now();

      // --- POST /api/auth/request { email, next? } -> mint token + email link ---
      // next: "admin" → magic link lands on admin.playenergyepoch.com
      if (url.pathname === "/api/auth/request" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as {
          email?: string;
          next?: string;
        };
        const email = normEmail(body.email);
        const nextAdmin = body.next === "admin";
        // Enumeration-safe: always return 200, regardless of validity.
        // Admin flow: only ever email the allowlisted operator.
        if (validEmail(email) && (!nextAdmin || isAdminEmail(email))) {
          const token = randHex(32);
          const hash = await sha256hex(token);
          await env.DB.prepare(
            `INSERT INTO login_tokens (token_hash, email, expires_at, created_at)
             VALUES (?, ?, ?, ?)`,
          )
            .bind(hash, email, now + TOKEN_TTL_MS, now)
            .run();
          // Link points at the STATIC /confirm page; that page fetch()es consume.
          const base = nextAdmin ? adminBase(env) : env.APP_URL;
          const link = `${base}/confirm?token=${token}${nextAdmin ? "&next=admin" : ""}`;
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
        // One-time handoff code: game page can POST it if Set-Cookie on fetch was dropped.
        const handoff = randHex(16);
        await ensureHandoffTable(env);
        await env.DB.prepare(
          `INSERT INTO auth_handoffs (code_hash, session_id, expires_at) VALUES (?, ?, ?)`,
        )
          .bind(await sha256hex(handoff), sid, now + 5 * 60 * 1000)
          .run();
        // JSON for confirm page fetch; also set cookie here when the browser allows it.
        const headers = new Headers({ "content-type": "application/json" });
        appendSessionCookies(headers, sid, req);
        return new Response(JSON.stringify({ ok: true, handoff }), { status: 200, headers });
      }

      // --- Redeem handoff → Set-Cookie (JSON fetch OR full-page form POST) ---
      // Full-page POST is more reliable than fetch() Set-Cookie in some webviews.
      if (url.pathname === "/api/auth/handoff" || url.pathname === "/api/auth/session") {
        let code = "";
        if (req.method === "POST") {
          const ct = (req.headers.get("content-type") ?? "").toLowerCase();
          if (ct.includes("application/json")) {
            const body = (await req.json().catch(() => ({}))) as { handoff?: string };
            code = String(body.handoff ?? "");
          } else {
            const form = await req.formData().catch(() => null);
            code = String(form?.get("handoff") ?? form?.get("h") ?? "");
          }
        } else if (req.method === "GET") {
          // Prefer not to use GET (email prefetch); still supported with one-time codes.
          code = url.searchParams.get("h") ?? url.searchParams.get("handoff") ?? "";
        } else {
          return json({ error: "method not allowed" }, 405);
        }
        code = code.replace(/[^a-f0-9]/gi, "");
        if (!code) {
          if (req.method === "GET" || (req.headers.get("accept") ?? "").includes("text/html")) {
            return Response.redirect(`${env.APP_URL}/?signin=failed`, 303);
          }
          return json({ error: "missing handoff" }, 400);
        }
        await ensureHandoffTable(env);
        const hash = await sha256hex(code);
        const row = await env.DB.prepare(
          `SELECT session_id, expires_at FROM auth_handoffs WHERE code_hash = ?`,
        )
          .bind(hash)
          .first<{ session_id: string; expires_at: number }>();
        if (!row || row.expires_at < now) {
          if (req.method === "GET" || (req.headers.get("accept") ?? "").includes("text/html")) {
            return Response.redirect(`${env.APP_URL}/?signin=failed`, 303);
          }
          return json({ error: "invalid or expired handoff" }, 400);
        }
        await env.DB.prepare(`DELETE FROM auth_handoffs WHERE code_hash = ?`)
          .bind(hash)
          .run();
        const sess = await env.DB.prepare(
          `SELECT user_id FROM sessions WHERE id_hash = ? AND expires_at > ?`,
        )
          .bind(await sha256hex(row.session_id), now)
          .first();
        if (!sess) {
          if (req.method === "GET" || (req.headers.get("accept") ?? "").includes("text/html")) {
            return Response.redirect(`${env.APP_URL}/?signin=failed`, 303);
          }
          return json({ error: "session expired" }, 401);
        }
        // Full-page / form POST → 303 into the game with cookie on the navigation response.
        const wantsNav =
          url.pathname === "/api/auth/session" ||
          req.method === "GET" ||
          (req.headers.get("accept") ?? "").includes("text/html");
        if (wantsNav) {
          const headers = new Headers({
            Location: `${env.APP_URL.replace(/\/$/, "")}/?signedin=1`,
            "cache-control": "no-store",
          });
          appendSessionCookies(headers, row.session_id, req);
          return new Response(null, { status: 303, headers });
        }
        const headers = new Headers({ "content-type": "application/json" });
        appendSessionCookies(headers, row.session_id, req);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      }

      // --- GET /api/me ---
      if (url.pathname === "/api/me" && req.method === "GET") {
        const u = await currentUser(req, env);
        return u
          ? json({ email: u.email, name: u.name, admin: isAdminEmail(u.email) })
          : json({ error: "unauthorized" }, 401);
      }

      // --- POST /api/logout ---
      if (url.pathname === "/api/logout" && req.method === "POST") {
        const sid = getSessionId(req);
        if (sid) {
          await env.DB.prepare(`DELETE FROM sessions WHERE id_hash = ?`)
            .bind(await sha256hex(sid))
            .run();
        }
        const headers = new Headers({ "content-type": "application/json" });
        headers.append("Set-Cookie", clearCookieHeader(req));
        const dom = cookieDomainAttr(req);
        if (dom) {
          headers.append(
            "Set-Cookie",
            `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0${dom}`,
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      }

      // --- GET /api/admin/signups — operator only ---
      if (url.pathname === "/api/admin/signups" && req.method === "GET") {
        const u = await currentUser(req, env);
        if (!u || !isAdminEmail(u.email)) {
          return json({ error: "forbidden" }, 403);
        }
        const weekAgo = now - 7 * 24 * 3600 * 1000;
        const dayAgo = now - 24 * 3600 * 1000;
        const totals = await env.DB.prepare(
          `SELECT
             (SELECT COUNT(*) FROM users) AS total,
             (SELECT COUNT(*) FROM users WHERE created_at >= ?) AS week,
             (SELECT COUNT(*) FROM users WHERE created_at >= ?) AS day,
             (SELECT COUNT(*) FROM users WHERE last_login >= ?) AS activeWeek,
             (SELECT COUNT(*) FROM saves) AS saves
          `,
        )
          .bind(weekAgo, dayAgo, weekAgo)
          .first<{
            total: number;
            week: number;
            day: number;
            activeWeek: number;
            saves: number;
          }>();

        const rows = await env.DB.prepare(
          `SELECT u.id, u.email, u.name, u.created_at AS createdAt, u.last_login AS lastLogin,
                  (SELECT COUNT(*) FROM saves s WHERE s.user_id = u.id) AS saveCount
             FROM users u
            ORDER BY u.created_at DESC
            LIMIT 500`,
        ).all<{
          id: string;
          email: string;
          name: string | null;
          createdAt: number;
          lastLogin: number | null;
          saveCount: number;
        }>();

        return json({
          stats: {
            total: totals?.total ?? 0,
            week: totals?.week ?? 0,
            day: totals?.day ?? 0,
            activeWeek: totals?.activeWeek ?? 0,
            saves: totals?.saves ?? 0,
          },
          users: rows.results ?? [],
          generatedAt: now,
        });
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
