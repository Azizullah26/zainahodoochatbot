// auth.ts — Odoo JWT session management v3
// Imports signJwt and verifyJwt from separate jwt.ts module
import { cookies } from "next/headers"
import { signJwt, verifyJwt } from "@/lib/jwt"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-key")
const SESSION_COOKIE = "session"
const SESSION_MAX_AGE = 86400 * 30

const ODOO_URL = (process.env.ODOO_URL ?? "").replace(/\/$/, "")
const ODOO_DB = process.env.ODOO_DB ?? ""

// ─── Types ──────────────────────────────────────────────────────────

export type AppRole = string

export interface OdooUser {
  uid: number
  username: string
  name: string
  roles: string[]
  roleNames: string[]
  image?: string
}

export interface SessionPayload {
  uid: number
  username: string
  name: string
  // Store only minimal roles to keep cookie under 4096 bytes
  roles: string[]
  odooPassword: string
  // image and roleNames are NOT stored in cookie — fetched on demand
  iat: number
  exp: number
}

// ─── JWT ────────────────────────────────────────────────────────────

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
  } catch (err) {
    console.log("[v0] JWT verify failed:", err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Session ────────────────────────────────────────────────────────

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    console.log("[v0] getSession: cookie found =", !!token, "cookie name =", SESSION_COOKIE)
    if (!token) return null
    const session = await parseJwt(token)
    console.log("[v0] getSession: parsed =", !!session)
    return session
  } catch (err) {
    console.log("[v0] getSession error:", err instanceof Error ? err.message : err)
    return null
  }
}

export async function createSession(user: OdooUser, password: string): Promise<void> {
  // Keep cookie small: no image (base64), no roleNames — stay under browser's 4096 byte limit
  // Roles are truncated to first 20 to further reduce size
  const trimmedRoles = user.roles.slice(0, 20)
  const token = await createJwt(
    {
      uid: user.uid,
      username: user.username,
      name: user.name,
      roles: trimmedRoles,
      odooPassword: password,
    },
    SESSION_MAX_AGE
  )
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function logout(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

// ─── Odoo helpers ────────────────────────────────────────────────────

async function fetchEmployeeImage(uid: number, password: string): Promise<string | undefined> {
  try {
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
          args: [ODOO_DB, uid, password, "hr.employee", "search_read",
            [[["user_id", "=", uid]]], { fields: ["image_1920"], limit: 1 }],
        },
      }),
      signal: AbortSignal.timeout(10000),
    })
    const json = await res.json()
    const emp = (json.result ?? [])[0]
    if (emp?.image_1920) return `data:image/png;base64,${emp.image_1920}`
  } catch {
    // image is optional — silently ignore
  }
  return undefined
}

async function fetchUserGroups(
  uid: number,
  password: string
): Promise<{ roles: string[]; roleNames: string[] }> {
  const groupsRes = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id: 2,
      params: {
        service: "object",
        method: "execute_kw",
        args: [ODOO_DB, uid, password, "res.users", "read", [[uid]], { fields: ["groups_id"] }],
      },
    }),
    signal: AbortSignal.timeout(15000),
  })

  const groupsJson = await groupsRes.json()
  const groupIds: number[] = groupsJson.result?.[0]?.groups_id ?? []

  if (groupIds.length === 0) return { roles: [], roleNames: [] }

  const xmlRes = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id: 3,
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          ODOO_DB, uid, password,
          "ir.model.data", "search_read",
          [[["model", "=", "res.groups"], ["res_id", "in", groupIds]]],
          { fields: ["complete_name", "module", "name"], limit: 200 },
        ],
      },
    }),
    signal: AbortSignal.timeout(15000),
  })

  const xmlJson = await xmlRes.json()
  const records: Array<{ module: string; name: string; complete_name: string }> = xmlJson.result ?? []

  return {
    roles: records.map((g) => `${g.module}.${g.name}`),
    roleNames: records.map((g) => g.complete_name).filter(Boolean),
  }
}

// ─── Main auth function ──────────────────────────────────────────────

export async function authenticateWithOdoo(
  username: string,
  password: string
): Promise<OdooUser> {
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

  if (!response.ok) {
    throw new Error(`Odoo returned HTTP ${response.status}`)
  }

  const data = await response.json()

  if (data.error) {
    throw new Error(data.error.data?.message ?? data.error.message ?? "Authentication failed")
  }

  const result = data.result
  if (!result?.uid) {
    throw new Error("Invalid credentials")
  }

  const uid: number = result.uid
  const name: string = result.name ?? username

  let roles: string[] = []
  let roleNames: string[] = []
  let image: string | undefined

  try {
    const groups = await fetchUserGroups(uid, password)
    roles = groups.roles
    roleNames = groups.roleNames
    image = await fetchEmployeeImage(uid, password)
  } catch (err) {
    console.warn("[v0] Could not fetch groups/image:", err instanceof Error ? err.message : err)
  }

  return { uid, username, name, roles, roleNames, image }
}

// ─── RBAC helpers ────────────────────────────────────────────────────

export function resolveAppRoles(odooRoles: string[]): string[] {
  return odooRoles
}

export function getAllowedTools(_appRoles: string[]): string[] {
  return ["search_read", "read_group", "name_search", "calculator"]
}
