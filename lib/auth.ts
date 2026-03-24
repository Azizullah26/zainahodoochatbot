import { signJwt, verifyJwt } from "@/lib/jwt"
import { cookies } from "next/headers"

// Normalize URL: strip trailing slashes to prevent double-slash in paths
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "")
}

const ODOO_URL = normalizeUrl(process.env.ODOO_URL || "")
const ODOO_DB = process.env.ODOO_DB || ""

// JWT secret derived from ODOO env vars for zero-config
const JWT_SECRET_RAW = process.env.JWT_SECRET || `${ODOO_URL}-${ODOO_DB}-odoo-erp-assistant`
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW)
const SESSION_COOKIE = "odoo_session"
const SESSION_MAX_AGE = 60 * 60 * 8 // 8 hours

// ─── Types ──────────────────────────────────────────────────────────

export interface OdooUser {
  uid: number
  username: string
  name: string
  roles: string[]
  roleNames: string[]
}

export interface SessionPayload {
  uid: number
  username: string
  name: string
  roles: string[]
  roleNames: string[]
  odooPassword: string
  iat: number
  exp: number
}

// ─── Role definitions ───────────────────────────────────────────────

export type AppRole = "admin" | "project_manager" | "hr" | "staff"

const ROLE_MAP: Record<string, AppRole> = {
  "base.group_system": "admin",
  "base.group_erp_manager": "admin",
  "project.group_project_manager": "project_manager",
  "project.group_project_user": "project_manager",
  "hr.group_hr_manager": "hr",
  "hr.group_hr_user": "hr",
  "base.group_user": "staff",
}

const ROLE_TOOL_ACCESS: Record<AppRole, string[]> = {
  admin: ["getProjects", "getEmployees", "getTasks", "getPartners", "getTimesheets"],
  project_manager: ["getProjects", "getTasks", "getTimesheets"],
  hr: ["getEmployees"],
  staff: ["getProjects", "getTasks"],
}

export function resolveAppRoles(odooGroupXmlIds: string[]): AppRole[] {
  const roles = new Set<AppRole>()
  for (const xmlId of odooGroupXmlIds) {
    const mapped = ROLE_MAP[xmlId]
    if (mapped) roles.add(mapped)
  }
  if (roles.size === 0) roles.add("staff")
  return Array.from(roles)
}

export function getAllowedTools(appRoles: AppRole[]): string[] {
  const tools = new Set<string>()
  for (const role of appRoles) {
    const access = ROLE_TOOL_ACCESS[role]
    if (access) access.forEach((t) => tools.add(t))
  }
  return Array.from(tools)
}

// ─── Odoo Authentication ────────────────────────────────────────────

/**
 * Try /web/session/authenticate first (Odoo web client endpoint).
 * Returns { uid, name } on success, or null if 404 / unavailable.
 */
async function tryWebSessionAuth(
  username: string,
  password: string
): Promise<{ uid: number; name: string } | null> {
  const url = `${ODOO_URL}/web/session/authenticate`
  console.log("[v0] Trying /web/session/authenticate at:", url)

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: Date.now(),
        params: { db: ODOO_DB, login: username, password },
      }),
      signal: AbortSignal.timeout(15000),
    })

    console.log("[v0] /web/session/authenticate response status:", res.status)

    if (res.status === 404) {
      console.log("[v0] /web/session/authenticate returned 404, will try /jsonrpc fallback")
      return null
    }

    if (!res.ok) {
      console.log("[v0] /web/session/authenticate returned HTTP", res.status)
      return null
    }

    const data = await res.json()
    console.log("[v0] /web/session/authenticate result uid:", data.result?.uid)

    if (data.error) {
      console.log("[v0] /web/session/authenticate JSON-RPC error:", data.error.message)
      return null
    }

    const uid = data.result?.uid
    if (!uid || uid === false) return null

    return {
      uid: uid as number,
      name: (data.result?.name || data.result?.username || username) as string,
    }
  } catch (err) {
    console.log("[v0] /web/session/authenticate failed:", err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Fallback: use /jsonrpc with common.login (XML-RPC-style over JSON-RPC).
 * Works on virtually all Odoo deployments.
 */
async function tryJsonRpcLogin(
  username: string,
  password: string
): Promise<{ uid: number; name: string } | null> {
  const url = `${ODOO_URL}/jsonrpc`
  console.log("[v0] Trying /jsonrpc common.login at:", url)

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: Date.now(),
        params: {
          service: "common",
          method: "login",
          args: [ODOO_DB, username, password],
        },
      }),
      signal: AbortSignal.timeout(15000),
    })

    console.log("[v0] /jsonrpc common.login response status:", res.status)

    if (!res.ok) {
      throw new Error(`Odoo returned HTTP ${res.status}`)
    }

    const data = await res.json()
    console.log("[v0] /jsonrpc common.login result:", data.result)

    if (data.error) {
      throw new Error(data.error.data?.message || data.error.message || "Login failed")
    }

    const uid = data.result
    if (!uid || uid === false) {
      throw new Error("Invalid username or password")
    }

    return { uid: uid as number, name: username }
  } catch (err) {
    console.log("[v0] /jsonrpc common.login failed:", err instanceof Error ? err.message : err)
    throw err
  }
}

export async function authenticateWithOdoo(
  username: string,
  password: string
): Promise<OdooUser> {
  console.log("[v0] authenticateWithOdoo called for:", username)
  console.log("[v0] ODOO_URL:", ODOO_URL)
  console.log("[v0] ODOO_DB:", ODOO_DB)

  if (!ODOO_URL) throw new Error("ODOO_URL environment variable is not set")
  if (!ODOO_DB) throw new Error("ODOO_DB environment variable is not set")

  // Strategy: try /web/session/authenticate, fall back to /jsonrpc
  let result = await tryWebSessionAuth(username, password)

  if (!result) {
    console.log("[v0] /web/session/authenticate unavailable, falling back to /jsonrpc")
    result = await tryJsonRpcLogin(username, password)
  }

  if (!result) {
    throw new Error("Invalid username or password")
  }

  const { uid, name } = result

  console.log("[v0] Auth success, uid:", uid, "name:", name)

  // Fetch user groups for RBAC
  let roles: string[] = []
  let roleNames: string[] = []

  try {
    const groupsRes = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: Date.now(),
        params: {
          service: "object",
          method: "execute_kw",
          args: [ODOO_DB, uid, password, "res.users", "read", [[uid]], { fields: ["groups_id"] }],
        },
      }),
      signal: AbortSignal.timeout(15000),
    })

    const groupsData = await groupsRes.json()
    const groupIds: number[] = groupsData.result?.[0]?.groups_id || []
    console.log("[v0] User group IDs count:", groupIds.length)

    if (groupIds.length > 0) {
      const xmlIdRes = await fetch(`${ODOO_URL}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          id: Date.now(),
          params: {
            service: "object",
            method: "execute_kw",
            args: [
              ODOO_DB, uid, password,
              "ir.model.data",
              "search_read",
              [[["model", "=", "res.groups"], ["res_id", "in", groupIds]]],
              { fields: ["complete_name", "module", "name"], limit: 200 },
            ],
          },
        }),
        signal: AbortSignal.timeout(15000),
      })

      const xmlIdData = await xmlIdRes.json()
      const groupRecords = xmlIdData.result || []

      roles = groupRecords.map((g: { module: string; name: string }) => `${g.module}.${g.name}`)
      roleNames = groupRecords.map((g: { complete_name: string }) => g.complete_name).filter(Boolean)
      console.log("[v0] Resolved roles:", roles.length)
    }
  } catch (err) {
    console.warn("[v0] Failed to fetch Odoo groups, defaulting to staff role:", err)
  }

  return { uid, username, name, roles, roleNames }
}

// ─── Session Management (JWT + HTTP-only cookies) ───────────────────

export async function createSession(user: OdooUser, password: string): Promise<void> {
  const token = await signJwt(
    {
      uid: user.uid,
      username: user.username,
      name: user.name,
      roles: user.roles,
      roleNames: user.roleNames,
      odooPassword: password,
    },
    JWT_SECRET,
    SESSION_MAX_AGE
  )

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value

  if (!token) return null

  try {
    const { payload } = await verifyJwt<SessionPayload>(token, JWT_SECRET)
    return payload
  } catch {
    return null
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
