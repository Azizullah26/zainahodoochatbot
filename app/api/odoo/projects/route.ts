import { searchRead } from "@/lib/odoo/jsonrpc"
import { requireRole } from "@/lib/route-guard"

export const maxDuration = 30

const PROJECT_FIELDS = [
  "id",
  "name",
  "display_name",
  "active",
  "partner_id",
  "user_id",
  "date_start",
]

export async function GET(req: Request) {
  const auth = await requireRole("admin", "project_manager", "staff")
  if (!auth.authorized) return auth.response

  try {
    const { searchParams } = new URL(req.url)
    const activeOnly = searchParams.get("active") !== "false"
    const name = searchParams.get("name")
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    const domain: unknown[][] = []
    if (activeOnly) domain.push(["active", "=", true])
    if (name) domain.push(["name", "ilike", name])

    const projects = await searchRead(auth.uid, auth.password, "project.project", domain, PROJECT_FIELDS, {
      limit,
      offset,
      order: "name asc",
    })

    return Response.json({ success: true, count: projects.length, data: projects })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch projects"
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
