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
import { getSession, fetchUserName } from "@/lib/auth"
import {
  getAllowedModelsForRoles,
  isModelAllowed,
  getModelFields,
} from "@/lib/allowed-models"

export const maxDuration = 60

function buildSystemPrompt(
  userName: string,
  uid: number,
  allowedModels: string[]
): string {
  const modelList = allowedModels.join(", ")

  return `You are an AI assistant connected to a live Odoo ERP system for El Race Construction Company.
The current user is "${userName}".

Your allowed Odoo models: ${modelList}

You have 4 tools:
1. search_read  — fetch records with filters/sorting
2. read_group   — aggregate/totals (counts, sums)
3. name_search  — find records by name, returns IDs
4. calculator   — math calculations

NATURAL LANGUAGE → ODOO TRANSLATION:
Always map user language to the correct model and domain filter:

| User says | Model | Domain |
|-----------|-------|--------|
| active projects | project.project | [["active","=",true]] |
| all projects | project.project | [] |
| delayed / late projects | project.project | [["date","<","${new Date().toISOString().split("T")[0]}"],["state","not in",["close","cancelled"]]] |
| active employees | hr.employee | [["active","=",true]] |
| all employees | hr.employee | [] |
| unpaid invoices / bills | account.move | [["state","=","posted"],["payment_state","!=","paid"],["move_type","in",["in_invoice","in_receipt"]]] |
| vendor invoices | account.move | [["move_type","in",["in_invoice","in_receipt"]]] |
| LPO / purchase orders | purchase.order | [] |
| leaves / leave requests | hr.leave | [] |
| petty cash / expenses | hr.expense | [] |
| material requests | material.request | [] |
| attendance | hr.attendance | [] |

RULES:
1. ALWAYS use tools — never invent data
2. Use search_read for lists, read_group for summaries/totals
3. If user asks for a count or total, prefer read_group
4. For "active X" add domain [["active","=",true]]
5. For "my X" add domain [["user_id","=",${uid}]]
6. Present results as markdown tables with a summary line (e.g., "Found 12 active projects")
7. Show counts and relevant fields only — keep responses concise
8. If no records found, say so clearly`
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
    if (!session) {
      return Response.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      )
    }

    // 2. Get allowed models (any authenticated user gets full access)
    const allowedModels = getAllowedModelsForRoles(["authenticated"])

    // 3. Fetch user name on demand (not stored in cookie)
    let userName = `User ${session.uid}`
    try {
      userName = await fetchUserName(session.uid, session.odooPassword)
    } catch {
      // fallback to uid-based name
    }

    // 4. Create tools with model allowlisting
    const allTools = createTools(session.uid, session.odooPassword, allowedModels)

    // 5. Build system prompt with allowed models
    const systemPrompt = buildSystemPrompt(userName, session.uid, allowedModels)

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
