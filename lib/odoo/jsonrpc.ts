const ODOO_URL = process.env.ODOO_URL!
const ODOO_DB = process.env.ODOO_DB!
const ODOO_USERNAME = process.env.ODOO_USERNAME!
const ODOO_PASSWORD = process.env.ODOO_PASSWORD!

let cachedUid: number | null = null
let cachedUidExpiry = 0
const CACHE_TTL = 1000 * 60 * 30 // 30 minutes

interface JsonRpcResponse {
  jsonrpc: string
  id: number
  result?: unknown
  error?: {
    code: number
    message: string
    data: { message: string }
  }
}

async function jsonRpcCall(
  url: string,
  method: string,
  params: Record<string, unknown>,
  retries = 3
): Promise<unknown> {
  const body = {
    jsonrpc: "2.0",
    method: "call",
    id: Date.now(),
    params: {
      service: method.split(".")[0],
      method: method.split(".").slice(1).join("."),
      args: params.args || [],
    },
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: JsonRpcResponse = await response.json()

      if (data.error) {
        throw new Error(
          data.error.data?.message || data.error.message || "JSON-RPC error"
        )
      }

      return data.result
    } catch (error) {
      if (attempt === retries) {
        throw error
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

export async function authenticate(): Promise<number> {
  const now = Date.now()
  if (cachedUid && now < cachedUidExpiry) {
    return cachedUid
  }

  const uid = (await jsonRpcCall(`${ODOO_URL}/jsonrpc`, "common.login", {
    args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD],
  })) as number

  if (!uid || uid === false) {
    throw new Error("Authentication failed: invalid credentials")
  }

  cachedUid = uid
  cachedUidExpiry = now + CACHE_TTL
  return uid
}

export async function executeKw(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  const uid = await authenticate()

  return jsonRpcCall(`${ODOO_URL}/jsonrpc`, "object.execute_kw", {
    args: [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kwargs],
  })
}

export async function searchRead(
  model: string,
  domain: unknown[][] = [],
  fields: string[] = [],
  options: { limit?: number; offset?: number; order?: string } = {}
): Promise<Record<string, unknown>[]> {
  const kwargs: Record<string, unknown> = {}
  if (fields.length > 0) kwargs.fields = fields
  if (options.limit) kwargs.limit = options.limit
  if (options.offset) kwargs.offset = options.offset
  if (options.order) kwargs.order = options.order

  const result = await executeKw(model, "search_read", [domain], kwargs)
  return (result as Record<string, unknown>[]) || []
}
