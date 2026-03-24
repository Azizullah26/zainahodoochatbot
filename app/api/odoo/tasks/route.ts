import { searchRead } from "@/lib/odoo/jsonrpc"

export const maxDuration = 30

const TASK_FIELDS = [
  "id",
  "name",
  "project_id",
  "user_ids",
  "stage_id",
  "priority",
  "date_deadline",
  "kanban_state",
]

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get("project_id")
    const name = searchParams.get("name")
    const userId = searchParams.get("user_id")
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    const domain: unknown[][] = []
    if (projectId) domain.push(["project_id", "=", parseInt(projectId, 10)])
    if (name) domain.push(["name", "ilike", name])
    if (userId) domain.push(["user_ids", "in", [parseInt(userId, 10)]])

    const tasks = await searchRead("project.task", domain, TASK_FIELDS, {
      limit,
      offset,
      order: "priority desc, name asc",
    })

    return Response.json({ success: true, count: tasks.length, data: tasks })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch tasks"
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
