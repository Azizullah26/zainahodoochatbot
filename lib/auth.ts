import { cookies } from "next/headers"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const SESSION_COOKIE = "sid"
const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days in seconds
const SESSION_KEY_PREFIX = "session:"

export const ODOO_URL = (process.env.ODOO_URL ?? "").replace(/\/$/, "")
export const ODOO_DB = process.env.ODOO_DB ?? ""

// ─── Types ──────────────────────────────────────────────────────────

export type AppRole = string

export interface SessionPayload {
  uid: number
  odooPassword: string
}

export interface OdooUser {
  uid: number
  username: string
  name: string
  image?: string
}

// ─── Session (Redis-backed) ──────────────────────────────────────────

function generateSessionId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function createSession(uid: number, password: string): Promise<void> {
  const sessionId = generateSessionId()
  const payload: SessionPayload = { uid, odooPassword: password }

  // Store full session data in Redis with TTL
  await redis.set(`${SESSION_KEY_PREFIX}${sessionId}`, JSON.stringify(payload), {
    ex: SESSION_TTL,
  })
  console.log("[v0] createSession: Stored in Redis, sessionId =", sessionId.slice(0, 8))

  // Store only the tiny session ID in the cookie (~64 bytes)
  const store = await cookies()
  store.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  })
  console.log("[v0] createSession: Cookie set, cookie name =", SESSION_COOKIE)
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const store = await cookies()
    const sessionId = store.get(SESSION_COOKIE)?.value
    console.log("[v0] getSession: sessionId found =", !!sessionId, "id =", sessionId?.slice(0, 8))
    if (!sessionId) return null

    const raw = await redis.get<string>(`${SESSION_KEY_PREFIX}${sessionId}`)
    console.log("[v0] getSession: Redis lookup =", !!raw, "key =", `${SESSION_KEY_PREFIX}${sessionId.slice(0, 8)}`)
    if (!raw) return null

    const payload: SessionPayload =
      typeof raw === "string" ? JSON.parse(raw) : (raw as SessionPayload)

    // Refresh TTL on access (sliding expiry)
    await redis.expire(`${SESSION_KEY_PREFIX}${sessionId}`, SESSION_TTL)

    return payload
  } catch (err) {
    console.log("[v0] getSession error:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function destroySession(): Promise<void> {
  try {
    const store = await cookies()
    const sessionId = store.get(SESSION_COOKIE)?.value
    if (sessionId) {
      await redis.del(`${SESSION_KEY_PREFIX}${sessionId}`)
    }
    store.delete(SESSION_COOKIE)
  } catch {
    // ignore
  }
}

// ─── Odoo authentication ────────────────────────────────────────────

export async function authenticateWithOdoo(
  username: string,
  password: string
): Promise<{ uid: number; name: string; image?: string }> {
  if (!ODOO_URL) throw new Error("ODOO_URL environment variable is not set")
  if (!ODOO_DB) throw new Error("ODOO_DB environment variable is not set")

  const response = await fetch(`${ODOO_URL}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { db: ODOO_DB, login: username, password },
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) throw new Error(`Odoo returned HTTP ${response.status}`)

  const data = await response.json()
  console.log("[v0] authenticateWithOdoo response:", JSON.stringify(data).slice(0, 200))

  if (data.error) {
    const errorMsg = data.error.data?.message ?? data.error.message ?? "Authentication failed"
    console.log("[v0] Odoo error:", errorMsg)
    throw new Error(errorMsg)
  }

  const result = data.result
  if (!result?.uid) throw new Error("Invalid credentials")

  const uid: number = result.uid
  const name: string = result.name ?? username

  // Fetch employee image on login — returned to client, lives in React state only
  let image: string | undefined
  try {
    image = await fetchEmployeeImage(uid, password)
  } catch {
    // image is optional
  }

  return { uid, name, image }
}

// ─── On-demand Odoo data fetchers ───────────────────────────────────

export async function fetchEmployeeImage(
  uid: number,
  password: string
): Promise<string | undefined> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id: 1,
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          ODOO_DB, uid, password,
          "hr.employee", "search_read",
          [[["user_id", "=", uid]]],
          { fields: ["image_128"], limit: 1 },
        ],
      },
    }),
    signal: AbortSignal.timeout(8000),
  })
  const json = await res.json()
  const emp = (json.result ?? [])[0]
  if (emp?.image_128) return `data:image/png;base64,${emp.image_128}`
  return undefined
}

export async function fetchUserName(uid: number, password: string): Promise<string> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id: 2,
      params: {
        service: "object",
        method: "execute_kw",
        args: [ODOO_DB, uid, password, "res.users", "read", [[uid]], { fields: ["name"] }],
      },
    }),
    signal: AbortSignal.timeout(8000),
  })
  const json = await res.json()
  return json.result?.[0]?.name ?? `User ${uid}`
}

// ─── Misc helpers ────────────────────────────────────────────────────

export function getAllowedTools(): string[] {
  return ["search_read", "read_group", "name_search", "calculator"]
}
