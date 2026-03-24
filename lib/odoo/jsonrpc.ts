const ODOO_URL = process.env.ODOO_URL!
const ODOO_DB = process.env.ODOO_DB!

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

/**
 * Low-level JSON-RPC call to Odoo.
 * All calls require explicit credentials (uid + password).
 * No Odoo calls happen without an authenticated user.
 */
async function jsonRpcCall(
  url: string,
  service: string,
  method: string,
  args: unknown[],
  retries = 3
): Promise<unknown> {
  const body = {
    jsonrpc: "2.0",
    method: "call",
    id: Date.now(),
    params: {
      service,
      method,
      args,
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
        const errMsg = data.error.data?.message || data.error.message || "JSON-RPC error"
        // If auth error, do not retry
        if (errMsg.includes("Access Denied") || errMsg.includes("Session expired")) {
          throw new Error(`Odoo auth error: ${errMsg}`)
        }
        throw new Error(errMsg)
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

/**
 * Execute an Odoo model method using the authenticated user's credentials.
 * @param uid - The logged-in user's Odoo user ID (from session)
 * @param password - The logged-in user's Odoo password (from session)
 */
export async function executeKw(
  uid: number,
  password: string,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  return jsonRpcCall(
    `${ODOO_URL}/jsonrpc`,
    "object",
    "execute_kw",
    [ODOO_DB, uid, password, model, method, args, kwargs]
  )
}

/**
 * Search and read records from an Odoo model.
 * Requires explicit user credentials -- Odoo is never called without auth.
 */
export async function searchRead(
  uid: number,
  password: string,
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

  const result = await executeKw(uid, password, model, "search_read", [domain], kwargs)
  return (result as Record<string, unknown>[]) || []
}
