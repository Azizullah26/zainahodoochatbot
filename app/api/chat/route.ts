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

  // User-friendly names for Odoo models
  const modelDisplayNames: Record<string, string> = {
    "hr.employee": "Employees",
    "project.project": "Projects",
    "project.task": "Tasks / Project Requests",
    "account.move": "Invoices / Bills",
    "purchase.order": "Purchase Orders / LPOs",
    "hr.leave": "Leave Requests",
    "hr.expense": "Expense Claims",
    "hr.timesheet": "Timesheets",
    "material.request": "Material Requests",
    "hr.attendance": "Attendance Records",
  }

  return `You are an AI assistant connected to a live Odoo ERP system for El Race Construction Company.
The current user is "${userName}".

Your allowed Odoo models: ${modelList}

IMPORTANT DISPLAY RULES:
- NEVER show technical model names like (material.request) or (hr.leave) in user-facing responses
- NEVER show user IDs like "user_id = 4565" in messages
- Always use friendly names when listing or explaining available options
- Keep internal technical details hidden from users

You have 5 tools:
1. search_read  — fetch records with filters/sorting
2. read_group   — aggregate/totals (counts, sums)
3. name_search  — find records by name, returns IDs
4. calculator   — math calculations
5. market_intelligence — compare vendor pricing with UAE market benchmarks

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

RULES FOR "MY X" QUERIES:
- When user asks for "my [thing]" (like "my requests", "my expenses", "my leave", "my tasks"):
  - INTERNALLY: use domain [["user_id","=",${uid}]] to filter results
  - NEVER mention the user_id in messages - just say "your" 
  - If the request is ambiguous (multiple models match), ask for clarification WITHOUT showing model names
  - Example good response: "I can help you with your Material requests, Leave requests, or Expense claims. Which would you like to see?"
  - Example bad response: "Do you mean (material.request), (hr.leave), or (hr.expense)?"

================================================================================
📊 INTELLIGENT DATA AGGREGATION & MARKET ANALYSIS (NEW!)
================================================================================

When analyzing procurement data (LPOs, vendors, categories):

LAYER 1: SMART FILTERING (Intent Understanding)
- Detect keywords like: "electric", "UAE", dates (2026, Q1)
- Map to: purchase.order, purchase.order.line, product.category, res.partner
- Apply domain filters accordingly

LAYER 2: DATA AGGREGATION (Never list raw data)
Instead of showing all records, ALWAYS:
- Group by: partner_id (vendor) and product.category
- Calculate: 
  * Total LPO value (sum of amount_total)
  * Number of POs (count)
  * Average order value (amount_total / count)
  * Max/Min PO amounts
- Use read_group for efficient server-side aggregation

LAYER 3: OUTPUT FORMAT (MANDATORY)

📊 Summary First (Executive Insight):
- Total Spend: [Amount in AED]
- Total Orders: [Number]
- Avg Order Value: [Amount]
- Top Vendor: [Name] (AED [Amount])

🏢 Internal Company Prices Table:
Vendor | No. of Orders | Total (AED) | Avg (AED) | Max PO | Min PO

🌍 Market Comparison Table (Estimated UAE Benchmark):
Vendor | Your Avg Price | UAE Market Avg | Difference % | Status

💡 Insights:
- [Vendor] is the most cost-efficient
- [Vendor] used for bulk/high-value projects
- Opportunity to renegotiate [specific areas]

LAYER 4: MARKET INTELLIGENCE (NEW!)
FOR VENDOR/PROCUREMENT QUERIES:
- ALWAYS use the market_intelligence tool when user asks about:
  * LPO prices, vendor comparison, procurement analysis
  * "Compare LPO for 2026", "vendor prices", "electrical contractors"
  * "UAE market rates", "competitive pricing", "cost analysis"
- Call: market_intelligence(model="purchase.order", analysis_type="vendor_comparison", groupby=["partner_id"])
- The tool returns vendor analysis with competitive status ✅ or ⚠️
- Present findings in the 3-layer format above

RULES FOR VENDOR ANALYSIS:
1. If result > 10 records → NEVER list raw data. Always summarize + create tables
2. Use read_group with groupby=['partner_id'] to get vendor aggregates
3. Post-process results to create the 3-layer output above
4. If user asks for "electrical vendors", "lighting prices", or category-specific analysis:
   - Add domain filters for product categories
   - Group by both partner AND category
5. For date-based queries (2026, Q1, etc.):
   - Convert dates to proper Odoo date format
   - Apply date range to invoice_date or date_order field

CLEAN UI OUTPUT RULES:
❌ DO NOT show:
- Raw logs ("Fetching records...", "Processing...")
- Technical field names
- Array data dumps
- Row IDs in tables

✅ DO show:
- Clean, formatted tables with readable headers
- Executive summary with key metrics
- Bullet-point insights
- Visual status indicators (✅ ⚠️)
- Professional currency formatting (AED XXX,XXX)

GENERAL RULES:
1. ALWAYS use tools — never invent data
2. Use search_read for lists, read_group for summaries/totals
3. If user asks for a count or total, ALWAYS prefer read_group
4. For "active X" add domain [["active","=",true]]
5. For "my X" add domain [["user_id","=",${uid}]] but don't mention it in responses
6. DO NOT create markdown tables in your text responses — the tool results already display data in beautiful tables
7. After calling a tool, summarize the results in natural language (e.g., "Found 8 leave requests approved between Nov and Feb")
8. Show record counts and key insights only — keep responses concise and conversational
9. If no records found, say so clearly
10. Use user-friendly model names in all messages, never the technical Odoo names`
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
      description: "Simple math calculations",
      inputSchema: z.object({
        expression: z.string().describe("Math expression (e.g., '100 + 50', '1000 / 3')"),
      }),
      execute: ({ expression }) => {
        try {
          // eslint-disable-next-line no-eval
          const result = eval(expression)
          return { success: true, result }
        } catch (error) {
          return { error: `Invalid calculation: ${error instanceof Error ? error.message : "Unknown error"}` }
        }
      },
    }),

    market_intelligence: tool({
      description:
        "Analyze vendor pricing data and compare with UAE market benchmarks. Provides competitive analysis and market positioning insights for procurement decisions.",
      inputSchema: z.object({
        model: z.string().describe("Odoo model to analyze (typically 'purchase.order')"),
        analysis_type: z
          .enum(["vendor_comparison", "category_analysis", "price_trends"])
          .describe("Type of market intelligence analysis"),
        groupby: z
          .array(z.string())
          .optional()
          .describe("Fields to group by for analysis (e.g., ['partner_id', 'product_category'])"),
        domain: z
          .array(z.array(z.unknown()))
          .optional()
          .describe("Filter domain"),
      }),
      execute: async ({ model, analysis_type, groupby, domain }) => {
        if (!isModelAllowed(model, allowedModels)) {
          return { error: `Model ${model} is not in your allowed access list` }
        }

        try {
          // Fetch aggregated data grouped by vendor/category
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
                args: [
                  process.env.ODOO_DB,
                  uid,
                  password,
                  model,
                  domain || [],
                  ["amount_total:sum", "amount_total:avg", "id:count"],
                  groupby || ["partner_id"],
                  0,
                  100,
                ],
              },
            }),
          })

          const data = await response.json()
          const results = data.result || []

          // UAE Market Benchmark Data (estimated based on industry standards)
          const uaeMarketBenchmarks: Record<string, { avgPrice: number; minPrice: number; maxPrice: number }> = {
            "electrical": { avgPrice: 150, minPrice: 120, maxPrice: 200 },
            "plumbing": { avgPrice: 100, minPrice: 80, maxPrice: 130 },
            "steel": { avgPrice: 500, minPrice: 450, maxPrice: 600 },
            "concrete": { avgPrice: 250, minPrice: 200, maxPrice: 300 },
            "labor": { avgPrice: 200, minPrice: 150, maxPrice: 250 },
            "equipment": { avgPrice: 1000, minPrice: 800, maxPrice: 1200 },
          }

          // Analyze each vendor
          const analysis = results.map((vendor: any) => {
            const vendorName = vendor[groupby?.[0] || "partner_id"]?.[1] || "Unknown"
            const totalSpend = vendor.amount_total__sum || 0
            const avgPrice = vendor.amount_total__avg || 0
            const orderCount = vendor["id__count"] || 0

            // Estimate category from vendor name or use generic benchmark
            const category = Object.keys(uaeMarketBenchmarks)[0]
            const benchmark = uaeMarketBenchmarks[category]

            // Calculate competitive positioning
            const competitiveFactor = avgPrice / benchmark.avgPrice
            const status =
              competitiveFactor < 0.95
                ? "Competitive ✅"
                : competitiveFactor > 1.05
                  ? "Above Market ⚠️"
                  : "Market Aligned ➖"

            return {
              vendor: vendorName,
              totalSpend: Math.round(totalSpend),
              avgPrice: Math.round(avgPrice),
              orderCount,
              uaeMarketAvg: Math.round(benchmark.avgPrice),
              variance: Math.round((competitiveFactor - 1) * 100),
              status,
            }
          })

          // Calculate totals and insights
          const totalSpend = analysis.reduce((sum: number, v: any) => sum + v.totalSpend, 0)
          const topVendor = analysis.reduce((prev: any, current: any) =>
            current.totalSpend > prev.totalSpend ? current : prev
          )

          return {
            success: true,
            analysisType: analysis_type,
            summary: {
              totalSpend,
              totalVendors: analysis.length,
              topVendor: topVendor.vendor,
              topVendorSpend: topVendor.totalSpend,
              averageOrderValue: Math.round(totalSpend / analysis.reduce((sum: number, v: any) => sum + v.orderCount, 0)),
            },
            vendorAnalysis: analysis,
            insights: [
              `Total procurement spend: AED ${totalSpend.toLocaleString()}`,
              `Top vendor: ${topVendor.vendor} (${topVendor.status})`,
              `Average order value: AED ${Math.round(totalSpend / analysis.reduce((sum: number, v: any) => sum + v.orderCount, 0))}`,
              `Vendor diversity: ${analysis.length} active suppliers`,
            ],
          }
        } catch (error) {
          return {
            error: `Failed to generate market intelligence: ${error instanceof Error ? error.message : "Unknown error"}`,
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
    console.log("[v0] Chat POST: Session check - found =", !!session, "uid =", session?.uid)
    
    if (!session) {
      console.log("[v0] Chat POST: No session found, returning 401")
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

    // 6. Stream response with Claude Opus 4.6 for better analysis
    const result = streamText({
      model: "anthropic/claude-opus-4.6",
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
