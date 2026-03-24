import { signJwt, verifyJwt } from "@/lib/jwt"
import { cookies } from "next/headers"

// Normalize URL: strip trailing slashes AND any path segments to get base domain
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ""}`
  } catch {
    return url.replace(/\/+$/, "").replace(/\/[a-z].*$/, "")
  }
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
  image?: string // Base64 or data URL
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
// Model detection and data fetching system

async function fetchEmployeeImage(
  uid: number,
  password: string
): Promise<string | undefined> {
  try {
    const url = `${ODOO_URL}/jsonrpc`
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: Math.random(),
        params: {
          service: "object",
          method: "execute_kw",
          args: [
            ODOO_DB,
            uid,
            password,
            "hr.employee",
            "search_read",
            [[["user_id", "=", uid]]],
            { fields: ["image_1920"], limit: 1 },
          ],
        },
      }),
      signal: AbortSignal.timeout(10000),
    })

    const data = await response.json()
    const employees = data.result || []
    
    if (employees.length > 0 && employees[0].image_1920) {
      // Convert base64 to data URL
      return `data:image/png;base64,${employees[0].image_1920}`
    }
  } catch (err) {
    console.warn("[v0] Failed to fetch employee image:", err instanceof Error ? err.message : err)
  }
  
  return undefined
}

export async function authenticateWithOdoo(
  username: string,
  password: string
): Promise<OdooUser> {
  if (!ODOO_URL) throw new Error("ODOO_URL environment variable is not set")
  if (!ODOO_DB) throw new Error("ODOO_DB environment variable is not set")

  // Use the correct Odoo endpoint: /web/session/authenticate
  const url = `${ODOO_URL}/web/session/authenticate`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          db: ODOO_DB,
          login: username,
          password: password,
        },
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      throw new Error(`Odoo returned HTTP ${response.status}`)
    }

    const data = await response.json()

    // Check for JSON-RPC error
    if (data.error) {
      throw new Error(data.error.message || "Authentication failed")
    }

    // Extract result - should contain uid and other user data
    const result = data.result
    if (!result || !result.uid) {
      throw new Error("Invalid authentication response from Odoo")
    }

    const uid = result.uid
    const name = result.name || username

    console.log("[v0] Authentication successful, uid:", uid)

    // Fetch user groups for RBAC and employee image
    let roles: string[] = []
    let roleNames: string[] = []
    let image: string | undefined

    try {
      const groupsUrl = `${ODOO_URL}/jsonrpc`
      const groupsRes = await fetch(groupsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          id: Math.random(),
          params: {
            service: "object",
            method: "execute_kw",
            args: [ODOO_DB, uid, password, "res.users", "read", [[uid]], { fields: ["groups_id"] }],
          },
        }),
        signal: AbortSignal.timeout(15000),
      })

      const groupsData = await groupsRes.json()
      const userRecord = groupsData.result?.[0]
      const groupIds: number[] = userRecord?.groups_id || []

      if (groupIds.length > 0) {
        const xmlIdRes = await fetch(groupsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "call",
            id: Math.random(),
            params: {
              service: "object",
              method: "execute_kw",
              args: [
                ODOO_DB,
                uid,
                password,
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
      }
      
      // Fetch employee profile image
      image = await fetchEmployeeImage(uid, password)
    } catch (err) {
      console.warn("[v0] Failed to fetch Odoo groups/image, defaulting to staff role")
    }

    return { uid, username, name, roles, roleNames, image }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[v0] Odoo authentication error:", message)
    throw err
  }
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
      image: user.image,
      odooPassword: password,
    },
    JWT_SECRET,
    SESSION_MAX_AGE
  )

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
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
