import { searchRead } from "@/lib/odoo/jsonrpc"
import { requireRole } from "@/lib/route-guard"

export const maxDuration = 30

const PARTNER_FIELDS = [
  "id",
  "name",
  "email",
  "phone",
  "city",
  "country_id",
  "is_company",
]

export async function GET(req: Request) {
  const auth = await requireRole("admin")
  if (!auth.authorized) return auth.response

  try {
    const { searchParams } = new URL(req.url)
    const name = searchParams.get("name")
    const id = searchParams.get("id")
    const isCompany = searchParams.get("is_company")
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    const domain: unknown[][] = []
    if (name) domain.push(["name", "ilike", name])
    if (id) domain.push(["id", "=", parseInt(id, 10)])
    if (isCompany !== null && isCompany !== undefined) {
      domain.push(["is_company", "=", isCompany === "true"])
    }

    const partners = await searchRead("res.partner", domain, PARTNER_FIELDS, {
      limit,
      offset,
      order: "name asc",
    })

    return Response.json({ success: true, count: partners.length, data: partners })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch partners"
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
