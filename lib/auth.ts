import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

const ODOO_URL = process.env.ODOO_URL!
const ODOO_DB = process.env.ODOO_DB!

// JWT secret - derived from ODOO env vars for zero-config, but can be overridden
const JWT_SECRET_RAW = process.env.JWT_SECRET || `${ODOO_URL}-${ODOO_DB}-odoo-erp-assistant`
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW)
const SESSION_COOKIE = "odoo_session"
const SESSION_MAX_AGE = 60 * 60 * 8 // 8 hours

// ─── Types ──────────────────────────────────────────────────────────

export interface OdooUser {
  uid: number
  username: string
  name: string
  roles: string[]       // Odoo group XML IDs
  roleNames: string[]   // Odoo group display names
}

export interface SessionPayload {
  uid: number
  username: string
  name: string
  roles: string[]
  roleNames: string[]
  odooPassword: string  // encrypted in JWT, needed for per-user Odoo calls
  iat: number
  exp: number
}

// ─── Role definitions ───────────────────────────────────────────────

export type AppRole = "admin" | "project_manager" | "hr" | "staff"

// Maps Odoo group XML IDs to our app roles
const ROLE_MAP: Record<string, AppRole> = {
  "base.group_system": "admin",
  "base.group_erp_manager": "admin",
  "project.group_project_manager": "project_manager",
  "project.group_project_user": "project_manager",
  "hr.group_hr_manager": "hr",
  "hr.group_hr_user": "hr",
  "base.group_user": "staff",
}

// Which tools each role can access
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
  // Everyone is at least staff
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

export async function authenticateWithOdoo(
  username: string,
  password: string
): Promise<OdooUser> {
  // 1. Authenticate via JSON-RPC
  const authBody = {
    jsonrpc: "2.0",
    method: "call",
    id: Date.now(),
    params: {
      service: "common",
      method: "login",
      args: [ODOO_DB, username, password],
    },
  }

  const authRes = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authBody),
    signal: AbortSignal.timeout(15000),
  })

  if (!authRes.ok) {
    throw new Error("Failed to connect to Odoo")
  }

  const authData = await authRes.json()
  if (authData.error) {
    throw new Error(authData.error.data?.message || "Authentication failed")
  }

  const uid = authData.result
  if (!uid || uid === false) {
    throw new Error("Invalid username or password")
  }

  // 2. Fetch user name
  const nameBody = {
    jsonrpc: "2.0",
    method: "call",
    id: Date.now(),
    params: {
      service: "object",
      method: "execute_kw",
      args: [ODOO_DB, uid, password, "res.users", "read", [[uid]], { fields: ["name", "login", "groups_id"] }],
    },
  }

  const nameRes = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nameBody),
    signal: AbortSignal.timeout(15000),
  })

  const nameData = await nameRes.json()
  const userData = nameData.result?.[0]
  const name = userData?.name || username
  const groupIds: number[] = userData?.groups_id || []

  // 3. Fetch group XML IDs for role mapping
  let roles: string[] = []
  let roleNames: string[] = []

  if (groupIds.length > 0) {
    const groupBody = {
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
    }

    const groupRes = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(groupBody),
      signal: AbortSignal.timeout(15000),
    })

    const groupData = await groupRes.json()
    const groupRecords = groupData.result || []

    roles = groupRecords.map((g: { module: string; name: string }) => `${g.module}.${g.name}`)
    roleNames = groupRecords.map((g: { complete_name: string }) => g.complete_name).filter(Boolean)
  }

  return { uid, username, name, roles, roleNames }
}

// ─── Session Management (JWT + HTTP-only cookies) ───────────────────

export async function createSession(user: OdooUser, password: string): Promise<void> {
  const token = await new SignJWT({
    uid: user.uid,
    username: user.username,
    name: user.name,
    roles: user.roles,
    roleNames: user.roleNames,
    odooPassword: password,
  } satisfies Omit<SessionPayload, "iat" | "exp">)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(JWT_SECRET)

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
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
