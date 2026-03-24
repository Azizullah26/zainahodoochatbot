import { cookies } from "next/headers"
import { signJwt, verifyJwt } from "@/lib/jwt"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-key")
const SESSION_COOKIE = "session"
const SESSION_MAX_AGE = 86400 * 30 // 30 days

export const ODOO_URL = (process.env.ODOO_URL ?? "").replace(/\/$/, "")
export const ODOO_DB = process.env.ODOO_DB ?? ""

// ─── Types ──────────────────────────────────────────────────────────

export type AppRole = string

/**
 * Minimal session stored in cookie — only uid + password.
 * Everything else (name, roles, image) is fetched on demand.
 */
export interface SessionPayload {
  uid: number
  odooPassword: string
  iat: number
  exp: number
}

export interface OdooUser {
  uid: number
  username: string
  name: string
  image?: string
}

// ─── JWT helpers ────────────────────────────────────────────────────

async function createJwt(
  payload: Omit<SessionPayload, "iat" | "exp">,
  expiresIn: number
): Promise<string> {
  return signJwt(payload as Record<string, unknown>, JWT_SECRET, expiresIn)
}

async function parseJwt(token: string): Promise<SessionPayload | null> {
  try {
    const result = await verifyJwt<SessionPayload>(token, JWT_SECRET)
    return result?.payload ?? null
  } catch {
    return null
  }
}

// ─── Session ────────────────────────────────────────────────────────

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    console.log("[v0] getSession: cookie =", !!token, "len =", token?.length ?? 0)
    if (!token) return null
    const session = await parseJwt(token)
    console.log("[v0] getSession: uid =", session?.uid ?? "null")
    return session
  } catch (err) {
    console.log("[v0] getSession error:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function createSession(uid: number, password: string): Promise<void> {
  const token = await createJwt({ uid, odooPassword: password }, SESSION_MAX_AGE)
  console.log("[v0] createSession: token length =", token.length, "uid =", uid)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
  console.log("[v0] createSession: cookie set, name =", SESSION_COOKIE)
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
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

  if (data.error) {
    throw new Error(data.error.data?.message ?? data.error.message ?? "Authentication failed")
  }

  const result = data.result
  if (!result?.uid) throw new Error("Invalid credentials")

  const uid: number = result.uid
  const name: string = result.name ?? username

  // Fetch employee image on login (stored in React state, NOT in cookie)
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

export async function fetchUserName(
  uid: number,
  password: string
): Promise<string> {
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
