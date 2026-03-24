import { searchRead } from "@/lib/odoo/xmlrpc"

export const maxDuration = 30

const EMPLOYEE_FIELDS = [
  "id",
  "name",
  "work_email",
  "work_phone",
  "department_id",
  "job_id",
]

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const name = searchParams.get("name")
    const id = searchParams.get("id")
    const department = searchParams.get("department")
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    const domain: unknown[][] = []
    if (name) domain.push(["name", "ilike", name])
    if (id) domain.push(["id", "=", parseInt(id, 10)])
    if (department) domain.push(["department_id.name", "ilike", department])

    const employees = await searchRead("hr.employee", domain, EMPLOYEE_FIELDS, {
      limit,
      offset,
      order: "name asc",
    })

    return Response.json({ success: true, count: employees.length, data: employees })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch employees"
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
