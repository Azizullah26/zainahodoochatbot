import {
  convertToModelMessages,
  streamText,
  tool,
  UIMessage,
  validateUIMessages,
  stepCountIs,
} from "ai"
import { z } from "zod"
import { searchRead as jsonRpcSearchRead } from "@/lib/odoo/jsonrpc"
import { searchRead as xmlRpcSearchRead } from "@/lib/odoo/xmlrpc"

export const maxDuration = 60

const SYSTEM_PROMPT = `You are an AI assistant connected to a live Odoo ERP system.
You MUST use the available tools to fetch real data from Odoo. Do NOT make up or hallucinate any data.
Always call the appropriate tool when data is requested.

Available capabilities:
- Fetch projects (project.project) — use getProjects
- Fetch employees (hr.employee) — use getEmployees
- Fetch tasks (project.task) — use getTasks
- Fetch partners/contacts (res.partner) — use getPartners
- Fetch timesheets (account.analytic.line) — use getTimesheets

When presenting data:
- Format results clearly with names, IDs, and relevant details
- Use tables or lists for multiple records
- Summarize counts when appropriate
- If no results found, say so clearly
- If an error occurs fetching data, inform the user and suggest they try again

Filters you can apply:
- Projects: filter by name, active status
- Employees: filter by name, ID, department
- Tasks: filter by project, name, assigned user
- Partners: filter by name, ID, company status
- Timesheets: filter by project, employee, date range`

const tools = {
  getProjects: tool({
    description:
      "Fetch projects from Odoo ERP. Use this when users ask about projects, active projects, project details, or project listings.",
    inputSchema: z.object({
      name: z
        .string()
        .nullable()
        .describe("Filter by project name (partial match)"),
      active: z
        .boolean()
        .nullable()
        .describe("Filter by active status. Default is true (active only)."),
      limit: z
        .number()
        .nullable()
        .describe("Max number of results to return. Default 50."),
    }),
    execute: async ({ name, active, limit }) => {
      try {
        const domain: unknown[][] = []
        if (active !== null && active !== undefined)
          domain.push(["active", "=", active])
        else domain.push(["active", "=", true])
        if (name) domain.push(["name", "ilike", name])

        const projects = await jsonRpcSearchRead(
          "project.project",
          domain,
          [
            "id",
            "name",
            "display_name",
            "active",
            "partner_id",
            "user_id",
            "date_start",
          ],
          { limit: limit || 50, order: "name asc" }
        )
        return {
          success: true,
          count: projects.length,
          data: projects,
        }
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch projects",
        }
      }
    },
  }),

  getEmployees: tool({
    description:
      "Fetch employee records from Odoo ERP via XML-RPC. Use this when users ask about employees, staff, team members, or HR data.",
    inputSchema: z.object({
      name: z
        .string()
        .nullable()
        .describe("Filter by employee name (partial match)"),
      id: z.number().nullable().describe("Filter by exact employee ID"),
      department: z
        .string()
        .nullable()
        .describe("Filter by department name (partial match)"),
      limit: z
        .number()
        .nullable()
        .describe("Max number of results. Default 50."),
    }),
    execute: async ({ name, id, department, limit }) => {
      try {
        const domain: unknown[][] = []
        if (name) domain.push(["name", "ilike", name])
        if (id) domain.push(["id", "=", id])
        if (department)
          domain.push(["department_id.name", "ilike", department])

        const employees = await xmlRpcSearchRead(
          "hr.employee",
          domain,
          [
            "id",
            "name",
            "work_email",
            "work_phone",
            "department_id",
            "job_id",
          ],
          { limit: limit || 50, order: "name asc" }
        )
        return {
          success: true,
          count: employees.length,
          data: employees,
        }
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch employees",
        }
      }
    },
  }),

  getTasks: tool({
    description:
      "Fetch project tasks from Odoo ERP. Use this when users ask about tasks, assignments, deadlines, or kanban status.",
    inputSchema: z.object({
      projectId: z.number().nullable().describe("Filter by project ID"),
      name: z
        .string()
        .nullable()
        .describe("Filter by task name (partial match)"),
      userId: z.number().nullable().describe("Filter by assigned user ID"),
      limit: z
        .number()
        .nullable()
        .describe("Max number of results. Default 50."),
    }),
    execute: async ({ projectId, name, userId, limit }) => {
      try {
        const domain: unknown[][] = []
        if (projectId) domain.push(["project_id", "=", projectId])
        if (name) domain.push(["name", "ilike", name])
        if (userId) domain.push(["user_ids", "in", [userId]])

        const tasks = await jsonRpcSearchRead(
          "project.task",
          domain,
          [
            "id",
            "name",
            "project_id",
            "user_ids",
            "stage_id",
            "priority",
            "date_deadline",
            "kanban_state",
          ],
          { limit: limit || 50, order: "priority desc, name asc" }
        )
        return {
          success: true,
          count: tasks.length,
          data: tasks,
        }
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to fetch tasks",
        }
      }
    },
  }),

  getPartners: tool({
    description:
      "Fetch partners/contacts from Odoo ERP. Use this when users ask about contacts, customers, vendors, or companies.",
    inputSchema: z.object({
      name: z
        .string()
        .nullable()
        .describe("Filter by partner name (partial match)"),
      id: z.number().nullable().describe("Filter by exact partner ID"),
      isCompany: z
        .boolean()
        .nullable()
        .describe("Filter to companies only (true) or individuals only (false)"),
      limit: z
        .number()
        .nullable()
        .describe("Max number of results. Default 50."),
    }),
    execute: async ({ name, id, isCompany, limit }) => {
      try {
        const domain: unknown[][] = []
        if (name) domain.push(["name", "ilike", name])
        if (id) domain.push(["id", "=", id])
        if (isCompany !== null && isCompany !== undefined)
          domain.push(["is_company", "=", isCompany])

        const partners = await jsonRpcSearchRead(
          "res.partner",
          domain,
          [
            "id",
            "name",
            "email",
            "phone",
            "city",
            "country_id",
            "is_company",
          ],
          { limit: limit || 50, order: "name asc" }
        )
        return {
          success: true,
          count: partners.length,
          data: partners,
        }
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch partners",
        }
      }
    },
  }),

  getTimesheets: tool({
    description:
      "Fetch timesheet entries from Odoo ERP. Use this when users ask about timesheets, hours logged, time tracking, or analytic lines.",
    inputSchema: z.object({
      projectId: z.number().nullable().describe("Filter by project ID"),
      employeeId: z.number().nullable().describe("Filter by employee ID"),
      dateFrom: z
        .string()
        .nullable()
        .describe("Filter by start date (YYYY-MM-DD)"),
      dateTo: z
        .string()
        .nullable()
        .describe("Filter by end date (YYYY-MM-DD)"),
      limit: z
        .number()
        .nullable()
        .describe("Max number of results. Default 50."),
    }),
    execute: async ({ projectId, employeeId, dateFrom, dateTo, limit }) => {
      try {
        const domain: unknown[][] = []
        if (projectId) domain.push(["project_id", "=", projectId])
        if (employeeId) domain.push(["employee_id", "=", employeeId])
        if (dateFrom) domain.push(["date", ">=", dateFrom])
        if (dateTo) domain.push(["date", "<=", dateTo])

        const timesheets = await jsonRpcSearchRead(
          "account.analytic.line",
          domain,
          [
            "id",
            "name",
            "project_id",
            "task_id",
            "employee_id",
            "unit_amount",
            "date",
          ],
          { limit: limit || 50, order: "date desc" }
        )
        return {
          success: true,
          count: timesheets.length,
          data: timesheets,
        }
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch timesheets",
        }
      }
    },
  }),
}

export async function POST(req: Request) {
  const body = await req.json()

  const messages = await validateUIMessages<UIMessage>({
    messages: body.messages,
    tools,
  })

  const result = streamText({
    model: "openai/gpt-5-mini",
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(10),
  })

  return result.toUIMessageStreamResponse()
}
