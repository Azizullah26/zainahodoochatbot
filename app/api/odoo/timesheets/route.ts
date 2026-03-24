import { searchRead } from "@/lib/odoo/jsonrpc"
import { requireRole } from "@/lib/route-guard"

export const maxDuration = 30

const TIMESHEET_FIELDS = [
  "id",
  "name",
  "project_id",
  "task_id",
  "employee_id",
  "unit_amount",
  "date",
]

export async function GET(req: Request) {
  const auth = await requireRole("admin", "project_manager")
  if (!auth.authorized) return auth.response

  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get("project_id")
    const employeeId = searchParams.get("employee_id")
    const dateFrom = searchParams.get("date_from")
    const dateTo = searchParams.get("date_to")
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    const domain: unknown[][] = []
    if (projectId) domain.push(["project_id", "=", parseInt(projectId, 10)])
    if (employeeId) domain.push(["employee_id", "=", parseInt(employeeId, 10)])
    if (dateFrom) domain.push(["date", ">=", dateFrom])
    if (dateTo) domain.push(["date", "<=", dateTo])

    const timesheets = await searchRead(
      "account.analytic.line",
      domain,
      TIMESHEET_FIELDS,
      { limit, offset, order: "date desc" }
    )

    return Response.json({
      success: true,
      count: timesheets.length,
      data: timesheets,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch timesheets"
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
