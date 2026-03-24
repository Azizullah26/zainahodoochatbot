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
import { getSession } from "@/lib/auth"
import {
  getAllowedModelsForRoles,
  isModelAllowed,
  resolveModelFromQuery,
  detectModelsInQuery,
  getModelFields,
  SYNONYMS,
} from "@/lib/allowed-models"

export const maxDuration = 60

function buildSystemPrompt(
  userName: string,
  roles: string[],
  allowedModels: string[]
): string {
  const modelList = allowedModels.join(", ")
  const synonymList = Object.entries(SYNONYMS)
    .slice(0, 15)
    .map(([k, v]) => `"${k}" → ${v}`)
    .join(", ")

  return `You are an AI assistant connected to a live Odoo ERP system.
The current user is "${userName}" with roles: ${roles.join(", ")}.

Your allowed data access (models): ${modelList}

You have access to 4 tools:
1. name_search: Find records by name (returns IDs) - use this FIRST to find people/projects
2. search_read: Fetch detailed records with filtering and sorting
3. read_group: Aggregate data (totals, counts) by grouping
4. calculator: Perform math calculations

SMART MODEL DETECTION:
When users ask about data, automatically detect the Odoo model they're referring to:
- Recognize these synonyms: ${synonymList}
- If they say "projects", fetch from "project.project"
- If they say "employees", fetch from "hr.employee"
- If they say "invoices" or "bills", fetch from "account.move"
- Use search_read with appropriate filters based on context

DATA ENHANCEMENT RULES:
1. Always fetch the MOST RELEVANT fields for each model
2. Present data in clear tables with proper formatting
3. Include calculated summaries when relevant (use read_group for aggregation)
4. Always validate requested model is in allowed list before fetching
5. Use read_group to create reports (e.g., "Total expenses by department")
6. Never make up data - always use tools to fetch real Odoo data
7. If a search returns empty, clearly state no records match the criteria
8. Format dates and numbers consistently
9. Add context from related fields (e.g., show both employee name and department)

RESPONSE FORMAT:
- For single records: Show as organized key-value pairs
- For multiple records: Use markdown tables
- For aggregations: Use clear summaries with totals
- Always include record count and any filters applied`
}


function createTools(uid: number, password: string, allowedModels: string[]) {
  return {
    name_search: tool({
      description:
        "Step 1: Find record IDs by name. Returns record IDs that match the search term. Use the returned ID with search_read to get full details.",
      inputSchema: z.object({
        model: z.string().describe("Odoo model (e.g., 'hr.employee', 'project.project')"),
        name: z.string().describe("Name or partial name to search for"),
        domain: z
          .array(z.array(z.unknown()))
          .optional()
          .describe("Additional filter domain (optional)"),
        limit: z.number().optional().default(10),
      }),
      execute: async ({ model, name, domain, limit }) => {
        if (!isModelAllowed(model, allowedModels)) {
          return { error: `Model ${model} is not in your allowed access list` }
        }

        try {
          const response = await fetch(`${process.env.ODOO_URL}/jsonrpc`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "call",
              id: Math.random(),
              params: {
                service: "object",
                method: "name_search",
                args: [process.env.ODOO_DB, uid, password, model, name, domain || [], "ilike", limit],
              },
            }),
          })

          const data = await response.json()
          return {
            success: true,
            results: data.result || [],
            count: (data.result || []).length,
          }
        } catch (error) {
          return { error: `Failed to search: ${error instanceof Error ? error.message : "Unknown error"}` }
        }
      },
    }),

    search_read: tool({
      description:
        "Fetch detailed records from Odoo with filtering, sorting, and field selection. Use this AFTER name_search to get full details, or for direct filtered queries. Automatically optimizes field selection for readability.",
      inputSchema: z.object({
        model: z.string().describe("Odoo model"),
        domain: z
          .array(z.array(z.unknown()))
          .optional()
          .describe("Filter criteria (e.g., [['name', 'ilike', 'John']])"),
        fields: z
          .array(z.string())
          .optional()
          .describe("Fields to retrieve (empty = auto-select recommended fields)"),
        order: z
          .string()
          .optional()
          .describe("Sort order (e.g., 'name asc', 'date_created desc')"),
        limit: z.number().optional().default(40),
      }),
      execute: async ({ model, domain, fields, order, limit }) => {
        if (!isModelAllowed(model, allowedModels)) {
          return { error: `Model ${model} is not in your allowed access list` }
        }

        try {
          // Use recommended fields if none specified
          const fieldsToFetch = fields && fields.length > 0 ? fields : getModelFields(model)
          
          const results = await jsonRpcSearchRead(
            uid,
            password,
            model,
            domain || [],
            fieldsToFetch,
            { order, limit }
          )
          return { success: true, count: results.length, data: results }
        } catch (error) {
          return {
            error: `Failed to fetch ${model}: ${error instanceof Error ? error.message : "Unknown error"}`,
          }
        }
      },
    }),

    read_group: tool({
      description:
        "Aggregate and summarize data - group by fields and compute totals, counts, averages. Perfect for reports and summaries.",
      inputSchema: z.object({
        model: z.string().describe("Odoo model"),
        groupby: z
          .array(z.string())
          .describe("Fields to group by (e.g., ['department_id', 'project_id'])"),
        fields: z
          .array(z.string())
          .describe("Measure fields to aggregate (e.g., ['amount:sum', 'id:count'])"),
        domain: z
          .array(z.array(z.unknown()))
          .optional()
          .describe("Filter domain"),
        limit: z.number().optional().default(100),
      }),
      execute: async ({ model, groupby, fields, domain, limit }) => {
        if (!isModelAllowed(model, allowedModels)) {
          return { error: `Model ${model} is not in your allowed access list` }
        }

        try {
          const response = await fetch(`${process.env.ODOO_URL}/jsonrpc`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "call",
              id: Math.random(),
              params: {
                service: "object",
                method: "read_group",
                args: [process.env.ODOO_DB, uid, password, model, domain || [], fields, groupby, 0, limit],
              },
            }),
          })

          const data = await response.json()
          return { success: true, data: data.result || [] }
        } catch (error) {
          return {
            error: `Failed to aggregate: ${error instanceof Error ? error.message : "Unknown error"}`,
          }
        }
      },
    }),

    calculator: tool({
      description: "Perform mathematical calculations. Use for balance computations, totals, etc.",
      inputSchema: z.object({
        expression: z
          .string()
          .describe("Math expression (e.g., '5000 - (1200 + 300)', 'sum([100, 200, 300])')"),
      }),
      execute: async ({ expression }) => {
        try {
          // eslint-disable-next-line no-eval
          const result = eval(expression)
          return { success: true, result, expression }
        } catch (error) {
          return {
            error: `Calculation failed: ${error instanceof Error ? error.message : "Invalid expression"}`,
          }
        }
      },
    }),
  }
}

export async function POST(req: Request) {
  try {
    // 1. Verify session
    const session = await getSession()
    console.log("[v0] Chat POST: session =", !!session, "uid =", session?.uid)
    if (!session) {
      return Response.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      )
    }

    // 2. Get allowed models for this user's roles
    const allowedModels = getAllowedModelsForRoles(session.roles)
    console.log("[v0] Chat: roles count =", session.roles.length, "allowed models =", allowedModels.length)

    // 3. Create tools with model allowlisting
    const allTools = createTools(session.uid, session.odooPassword, allowedModels)

    // 4. Build system prompt with allowed models
    const systemPrompt = buildSystemPrompt(session.name, session.roles, allowedModels)

    // 5. Parse request
    const body = await req.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = await validateUIMessages<UIMessage>({
      messages: body.messages,
      tools: allTools as any,
    })

    // 6. Stream response
    const result = streamText({
      model: "openai/gpt-5-mini",
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: allTools,
      stopWhen: stepCountIs(10),
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat request failed"
    console.error("[v0] Chat error:", message, error)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
