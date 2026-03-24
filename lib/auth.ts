import { cookies } from "next/headers"
import { jwtVerify, SignJWT } from "jose"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-key")
const SESSION_COOKIE = "session"
const SESSION_MAX_AGE = 86400 * 30 // 30 days

const ODOO_URL = process.env.ODOO_URL
const ODOO_DB = process.env.ODOO_DB

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

// ─── JWT Functions ──────────────────────────────────────────────────

async function signJwt(
  payload: Omit<SessionPayload, "iat" | "exp">,
  secret: Uint8Array,
  expiresIn: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .sign(secret)
}

async function verifyJwt(token: string, secret: Uint8Array): Promise<SessionPayload | null> {
  try {
    const verified = await jwtVerify(token, secret)
    return verified.payload as SessionPayload
  } catch {
    return null
  }
}

// ─── Session Management ─────────────────────────────────────────────

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
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

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

// ─── Odoo Authentication ────────────────────────────────────────────

async function fetchEmployeeImage(uid: number, password: string): Promise<string | undefined> {
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
      return `data:image/png;base64,${employees[0].image_1920}`
    }
  } catch (err) {
    console.warn("[v0] Failed to fetch employee image:", err instanceof Error ? err.message : err)
  }

  return undefined
}

export async function authenticateWithOdoo(username: string, password: string): Promise<OdooUser> {
  if (!ODOO_URL) throw new Error("ODOO_URL environment variable is not set")
  if (!ODOO_DB) throw new Error("ODOO_DB environment variable is not set")

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

    if (data.error) {
      throw new Error(data.error.message || "Authentication failed")
    }

    const result = data.result
    if (!result || !result.uid) {
      throw new Error("Invalid authentication response from Odoo")
    }

    const uid = result.uid
    const name = result.name || username

    console.log("[v0] Authentication successful, uid:", uid)

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

      image = await fetchEmployeeImage(uid, password)
    } catch (err) {
      console.warn("[v0] Failed to fetch Odoo groups/image")
    }

    return { uid, username, name, roles, roleNames, image }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[v0] Odoo authentication error:", message)
    throw err
  }
}

// ─── Role-Based Access Control ──────────────────────────────────────

export function resolveAppRoles(odooRoles: string[]): string[] {
  return odooRoles
}

export function getAllowedTools(appRoles: string[]): string[] {
  return ["search_read", "read_group", "name_search", "calculator"]
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

