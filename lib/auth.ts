// auth.ts — Odoo JWT session management v2
import { cookies } from "next/headers"
import { jwtVerify, SignJWT } from "jose"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-key")
const SESSION_COOKIE = "odoo_session"
const SESSION_MAX_AGE = 86400 * 30

const ODOO_URL = (process.env.ODOO_URL ?? "").replace(/\/$/, "")
const ODOO_DB = process.env.ODOO_DB ?? ""

// ─── Types ──────────────────────────────────────────────────────────

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
  roles: string[]
  roleNames: string[]
  odooPassword: string
  image?: string
  iat: number
  exp: number
}

// ─── JWT ────────────────────────────────────────────────────────────

async function signJwt(
  payload: Omit<SessionPayload, "iat" | "exp">,
  secret: Uint8Array,
  expiresIn: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT(payload as Parameters<SignJWT["sign"]>[0])
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .sign(secret)
}

async function verifyJwt(token: string, secret: Uint8Array): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

// ─── Session ────────────────────────────────────────────────────────

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (!token) return null
    return await verifyJwt(token, JWT_SECRET)
  } catch {
    return null
  }
}

export async function createSession(user: OdooUser, password: string): Promise<void> {
  const token = await signJwt(
    {
      uid: user.uid,
      username: user.username,
      name: user.name,
      roles: user.roles,
      roleNames: user.roleNames,
      image: user.image,
      odooPassword: password,
    },
    JWT_SECRET,
    SESSION_MAX_AGE
  )
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
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
