const ODOO_URL = process.env.ODOO_URL!
const ODOO_DB = process.env.ODOO_DB!

function buildXmlRpcRequest(
  method: string,
  params: unknown[]
): string {
  const paramXml = params.map((p) => `<param>${valueToXml(p)}</param>`).join("")
  return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${paramXml}</params></methodCall>`
}

function valueToXml(value: unknown): string {
  if (value === null || value === undefined) {
    return "<value><boolean>0</boolean></value>"
  }
  if (typeof value === "boolean") {
    return `<value><boolean>${value ? 1 : 0}</boolean></value>`
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return `<value><int>${value}</int></value>`
    }
    return `<value><double>${value}</double></value>`
  }
  if (typeof value === "string") {
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    return `<value><string>${escaped}</string></value>`
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => valueToXml(v)).join("")
    return `<value><array><data>${items}</data></array></value>`
  }
  if (typeof value === "object") {
    const members = Object.entries(value as Record<string, unknown>)
      .map(
        ([k, v]) =>
          `<member><name>${k}</name>${valueToXml(v)}</member>`
      )
      .join("")
    return `<value><struct>${members}</struct></value>`
  }
  return `<value><string>${String(value)}</string></value>`
}

function parseXmlValue(xml: string): unknown {
  xml = xml.trim()

  const intMatch = xml.match(/<(?:int|i4)>([-\d]+)<\/(?:int|i4)>/)
  if (intMatch) return parseInt(intMatch[1], 10)

  const doubleMatch = xml.match(/<double>([-\d.]+)<\/double>/)
  if (doubleMatch) return parseFloat(doubleMatch[1])

  const stringMatch = xml.match(/<string>([\s\S]*?)<\/string>/)
  if (stringMatch) {
    return stringMatch[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
  }

  const boolMatch = xml.match(/<boolean>([01])<\/boolean>/)
  if (boolMatch) return boolMatch[1] === "1"

  const arrayDataMatch = xml.match(/<array><data>([\s\S]*?)<\/data><\/array>/)
  if (arrayDataMatch) {
    const values: unknown[] = []
    const valueRegex = /<value>([\s\S]*?)<\/value>/g
    let m
    while ((m = valueRegex.exec(arrayDataMatch[1])) !== null) {
      values.push(parseXmlValue(`<value>${m[1]}</value>`))
    }
    return values
  }

  const structMatch = xml.match(/<struct>([\s\S]*?)<\/struct>/)
  if (structMatch) {
    const obj: Record<string, unknown> = {}
    const memberRegex =
      /<member>\s*<name>([\s\S]*?)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g
    let m
    while ((m = memberRegex.exec(structMatch[1])) !== null) {
      obj[m[1]] = parseXmlValue(`<value>${m[2]}</value>`)
    }
    return obj
  }

  const bareValue = xml.match(/<value>([\s\S]*?)<\/value>/)
  if (bareValue) {
    const inner = bareValue[1].trim()
    if (
      inner.startsWith("<") &&
      !inner.startsWith("<![CDATA")
    ) {
      return parseXmlValue(inner)
    }
    return inner
  }

  return xml
}

function parseXmlRpcResponse(xml: string): unknown {
  const faultMatch = xml.match(/<fault>\s*<value>([\s\S]*?)<\/value>\s*<\/fault>/)
  if (faultMatch) {
    const fault = parseXmlValue(`<value>${faultMatch[1]}</value>`)
    throw new Error(
      `XML-RPC Fault: ${JSON.stringify(fault)}`
    )
  }

  const paramMatch = xml.match(
    /<params>\s*<param>\s*<value>([\s\S]*?)<\/value>\s*<\/param>\s*<\/params>/
  )
  if (paramMatch) {
    return parseXmlValue(`<value>${paramMatch[1]}</value>`)
  }

  throw new Error("Invalid XML-RPC response")
}

async function xmlRpcCall(
  endpoint: string,
  method: string,
  params: unknown[],
  retries = 3
): Promise<unknown> {
  const body = buildXmlRpcRequest(method, params)

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(`${ODOO_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const text = await response.text()
      return parseXmlRpcResponse(text)
    } catch (error) {
      if (attempt === retries) throw error
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

/**
 * Execute an Odoo model method via XML-RPC using the authenticated user's credentials.
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
  return xmlRpcCall("/xmlrpc/2/object", "execute_kw", [
    ODOO_DB,
    uid,
    password,
    model,
    method,
    args,
    kwargs,
  ])
}

/**
 * Search and read records via XML-RPC.
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
