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

You have 7 tools:
1. search_read  — fetch records with filters/sorting
2. read_group   — aggregate/totals (counts, sums)
3. name_search  — find records by name, returns IDs
4. calculator   — math calculations
5. market_intelligence — compare vendor pricing with UAE market benchmarks
6. cost_analysis — analyze project costs by category (LPO, Petty Cash, Invoice, Labor, Staff)
7. format_odoo_data — intelligently format and display data, useful for creating summaries/tables or when API has partial failures

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
INTELLIGENT DATA AGGREGATION & MARKET ANALYSIS (NEW!)
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

Summary First (Executive Insight):
- Total Spend: [Amount in AED]
- Total Orders: [Number]
- Avg Order Value: [Amount]
- Top Vendor: [Name] (AED [Amount])

Internal Company Prices Table:
Vendor | No. of Orders | Total (AED) | Avg (AED) | Max PO | Min PO

Market Comparison Table (Estimated UAE Benchmark):
Vendor | Your Avg Price | UAE Market Avg | Difference % | Status

Insights:
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
- The tool returns vendor analysis with competitive status (Competitive or Above Market)
- Present findings in the 3-layer format above

PROJECT COST ANALYSIS:
FOR PROJECT BUDGET/COST QUERIES:
- ALWAYS use the cost_analysis tool when user asks about:
  * Project budget breakdown, cost distribution, cost by category
  * "Project costs", "project budget", "how much spent on X"
  * "LPO vs labor", "cost breakdown", "where is project money going"
- Call: cost_analysis(project_id=PROJECT_ID) to get complete breakdown
- Tool returns costs for: LPO, Petty Cash, Invoice, Labor, Staff
- Present summary with percentages and key insights
- Example: "LPO accounts for 45% of project costs (AED 500K), followed by Labor at 30%"

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
DO NOT show:
- Raw logs ("Fetching records...", "Processing...")
- Technical field names
- Array data dumps
- Row IDs in tables

DO show:
- Clean, formatted tables with readable headers
- Executive summary with key metrics
- Bullet-point insights
- Visual status indicators (Competitive or Above Market)
- Professional currency formatting (AED XXX,XXX)

GENERAL RULES:
1. ALWAYS use tools — never invent data
2. Use search_read for lists, read_group for summaries/totals
3. If user asks for a count or total, ALWAYS prefer read_group
4. For "active X" add domain [["active","=",true]]
5. For "my X" add domain [["user_id","=",${uid}]] but don't mention it in responses
6. DO NOT create markdown tables in your text responses — the tool results already display data in beautiful tables
7. After the tool output displays the table, ONLY add brief insights/summary - DO NOT repeat the data
8. Use bullet point format for insights: start each item with a bullet (•) or dash (-)
9. Show record counts and key insights only — keep responses concise and conversational
10. If no records found, say so clearly
11. Use user-friendly model names in all messages, never the technical Odoo names
12. CRITICAL: When tool returns data in a table:
    - Let the table speak for itself - it already shows all the records
    - Only add brief summary text after the table (e.g., "Found 7 records" or key insights)
    - DO NOT repeat information that's already visible in the table
    - DO NOT add greeting text before the tool output like "Here are your 7 records:" - that duplicates the table headers

CRITICAL - HIDE ALL TECHNICAL DETAILS:
- NEVER mention tool names in responses (read_group, search_read, name_search, etc.)
- NEVER show internal field names or technical model names
- NEVER display asterisks (*), formatting symbols, or markdown characters
- DO NOT show phrases like "Found 7 search_read for you" or "read_group records"
- Clean output means: NO asterisks, NO tool names, NO technical jargon
- Respond in plain, natural language only
- All internal tool calls must be completely hidden from the user

TOOL OUTPUT BEHAVIOR:
- Tool outputs display data in a beautiful formatted table with all columns and values
- Your text response should ONLY add value that the table doesn't provide
- Examples of good follow-ups: "Most leaves are approved", "Average leave is 3 days"
- Examples of bad follow-ups: Repeating the table data or column headers in text format
- NEVER mention "search_read", "read_group", or "records" in any response`
}


// Tools factory - creates all available Odoo interaction tools with model allowlisting
function createTools(uid: number, password: string, allowedModels: string[]) {
  return {
    name_search: tool({
      description: "Search for records by name, returns matching record IDs",
      inputSchema: z.object({
        model: z.string().describe("Odoo model name"),
        name: z.string().describe("Name to search for"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of results (default: 10)"),
      }),
      execute: async ({ model, name, limit }) => {
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
                args: [process.env.ODOO_DB, uid, password, model, name, [], "ilike", limit || 10],
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
      description: "Fetch records from Odoo with filtering and search",
      inputSchema: z.object({
        model: z.string().describe("Odoo model name"),
        domain: z
          .array(z.array(z.unknown()))
          .optional()
          .describe("Filter conditions [[field, operator, value], ...]"),
        fields: z.array(z.string()).optional().describe("Fields to fetch"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of records (default: 50, max: 200)"),
        offset: z
          .number()
          .optional()
          .describe("Number of records to skip (for pagination)"),
        order: z
          .string()
          .optional()
          .describe("Sort order (e.g., 'name asc', 'create_date desc')"),
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
      description: "Aggregate records by grouping fields (totals, counts, averages)",
      inputSchema: z.object({
        model: z.string().describe("Odoo model name"),
        domain: z
          .array(z.array(z.unknown()))
          .optional()
          .describe("Filter conditions"),
        groupby: z
          .array(z.string())
          .optional()
          .describe("Fields to group by"),
        fields: z
          .array(z.string())
          .optional()
          .describe("Aggregation functions (e.g., ['amount_total:sum', 'id:count'])"),
        limit: z
          .number()
          .optional()
          .describe("Max groups returned (default: 50)"),
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
                ? "Competitive"
                : competitiveFactor > 1.05
                  ? "Above Market"
                  : "Market Aligned"

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

    cost_analysis: tool({
      description:
        "Analyze project costs by category (LPO, Petty Cash, Invoice, Labor, Staff). Provides cost distribution breakdown for budget tracking and financial analysis.",
      inputSchema: z.object({
        project_id: z.number().describe("Project ID to analyze costs for"),
        date_from: z.string().optional().describe("Start date (YYYY-MM-DD format, default: project start)"),
        date_to: z.string().optional().describe("End date (YYYY-MM-DD format, default: today)"),
      }),
      execute: async ({ project_id, date_from, date_to }) => {
        try {
          // Fetch project details for date range
          const projectResponse = await fetch(`${process.env.ODOO_URL}/jsonrpc`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "call",
              id: Math.random(),
              params: {
                service: "object",
                method: "read",
                args: [process.env.ODOO_DB, uid, password, "project.project", [project_id], ["name", "date_start"]],
              },
            }),
          })

          const projectData = await projectResponse.json()
          const project = projectData.result?.[0]
          
          if (!project) {
            return { error: `Project ${project_id} not found` }
          }

          const startDate = date_from || project.date_start || new Date().toISOString().split("T")[0]
          const endDate = date_to || new Date().toISOString().split("T")[0]

          const costAnalysis: Record<string, any> = {
            projectName: project.name,
            dateRange: { from: startDate, to: endDate },
            categories: {},
          }

          // 1. LPO - Group by material type
          const lpoResponse = await fetch(`${process.env.ODOO_URL}/jsonrpc`, {
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
                  "purchase.order",
                  [
                    ["state", "in", ["purchase", "done"]],
                    ["project_id", "=", project_id],
                    ["date_order", ">=", startDate],
                    ["date_order", "<=", endDate],
                  ],
                  ["amount_total:sum"],
                  ["material_type_id"],
                  0,
                  100,
                ],
              },
            }),
          })

          const lpoData = await lpoResponse.json()
          const lpoItems = (lpoData.result || []).map((row: any) => ({
            label: row.material_type_id?.[1] || "Other",
            amount: Math.round(row.amount_total__sum || 0),
          }))
          
          costAnalysis.categories.LPO = {
            items: lpoItems,
            total: lpoItems.reduce((sum: number, item: any) => sum + item.amount, 0),
          }

          // 2. Petty Cash - Group by type
          const expenseResponse = await fetch(`${process.env.ODOO_URL}/jsonrpc`, {
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
                  "hr.expense",
                  [
                    ["analytic_account_id.project_id", "=", project_id],
                    ["state", "=", "done"],
                    ["date", ">=", startDate],
                    ["date", "<=", endDate],
                  ],
                  ["total_amount:sum"],
                  ["x_petty_cash_type"],
                  0,
                  100,
                ],
              },
            }),
          })

          const expenseData = await expenseResponse.json()
          const expenseItems = (expenseData.result || []).map((row: any) => ({
            label: row.x_petty_cash_type || "General",
            amount: Math.round(row.total_amount__sum || 0),
          }))

          costAnalysis.categories["Petty Cash"] = {
            items: expenseItems,
            total: expenseItems.reduce((sum: number, item: any) => sum + item.amount, 0),
          }

          // 3. Invoice - Vendor bills
          const invoiceResponse = await fetch(`${process.env.ODOO_URL}/jsonrpc`, {
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
                  "account.move.line",
                  [
                    ["analytic_account_id.project_id", "=", project_id],
                    ["move_id.state", "=", "posted"],
                    ["move_id.move_type", "in", ["in_invoice", "in_receipt"]],
                    ["date", ">=", startDate],
                    ["date", "<=", endDate],
                  ],
                  ["balance:sum"],
                  [],
                  0,
                  1,
                ],
              },
            }),
          })

          const invoiceData = await invoiceResponse.json()
          const invoiceTotal = Math.round((invoiceData.result?.[0]?.balance__sum || 0))
          
          costAnalysis.categories.Invoice = {
            items: invoiceTotal > 0 ? [{ label: "Vendor Bills", amount: invoiceTotal }] : [],
            total: invoiceTotal,
          }

          // 4. Labor Cost
          const laborResponse = await fetch(`${process.env.ODOO_URL}/jsonrpc`, {
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
                  "hr.payslip.cost.allocation",
                  [
                    ["project_id", "=", project_id],
                    ["employee_id.is_labor", "=", true],
                    ["date", ">=", startDate],
                    ["date", "<=", endDate],
                  ],
                  ["amount:sum"],
                  [],
                  0,
                  1,
                ],
              },
            }),
          })

          const laborData = await laborResponse.json()
          const laborTotal = Math.round((laborData.result?.[0]?.amount__sum || 0))

          costAnalysis.categories.Labor = {
            items: laborTotal > 0 ? [{ label: "Labor", amount: laborTotal }] : [],
            total: laborTotal,
          }

          // 5. Staff Cost
          const staffResponse = await fetch(`${process.env.ODOO_URL}/jsonrpc`, {
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
                  "hr.payslip.cost.allocation",
                  [
                    ["project_id", "=", project_id],
                    ["employee_id.is_labor", "=", false],
                    ["date", ">=", startDate],
                    ["date", "<=", endDate],
                  ],
                  ["amount:sum"],
                  [],
                  0,
                  1,
                ],
              },
            }),
          })

          const staffData = await staffResponse.json()
          const staffTotal = Math.round((staffData.result?.[0]?.amount__sum || 0))

          costAnalysis.categories.Staff = {
            items: staffTotal > 0 ? [{ label: "Staff", amount: staffTotal }] : [],
            total: staffTotal,
          }

          // Calculate totals and percentages
          const allCategoryTotals = Object.values(costAnalysis.categories).map((cat: any) => cat.total)
          const grandTotal = allCategoryTotals.reduce((sum: number, val: number) => sum + val, 0)

          costAnalysis.summary = {
            grandTotal,
            breakdown: Object.entries(costAnalysis.categories).map(([category, data]: [string, any]) => ({
              category,
              total: data.total,
              percentage: grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0,
            })),
          }

          return { success: true, costAnalysis }
        } catch (error) {
          return {
            error: `Failed to analyze project costs: ${error instanceof Error ? error.message : "Unknown error"}`,
          }
        }
      },
    }),

    format_odoo_data: tool({
      description:
        "Intelligently format and display Odoo data with fallback handling. Use this when you need to present data in a readable, structured format or when data retrieval had partial failures. This tool helps create beautiful summaries and tables from raw Odoo records.",
      inputSchema: z.object({
        data: z.unknown().describe("Raw Odoo data to format (array of records or single record)"),
        format_type: z
          .enum(["table", "summary", "list", "statistics"])
          .describe("How to format the data for display"),
        title: z.string().optional().describe("Title for the formatted output"),
        highlights: z
          .array(z.string())
          .optional()
          .describe("Key fields to highlight or summarize"),
      }),
      execute: ({ data, format_type, title, highlights }) => {
        try {
          if (!data) {
            return {
              success: true,
              formatted: "No data available",
              message: "The requested data is currently unavailable",
            }
          }

          const isArray = Array.isArray(data)
          const records = isArray ? data : [data as any]

          if (records.length === 0) {
            return {
              success: true,
              formatted: "No records found",
              message: "The query returned no results",
            }
          }

          // Extract key fields for highlighting
          const fieldsToShow = highlights && highlights.length > 0 ? highlights : Object.keys(records[0] || {}).slice(0, 5)

          let formatted = ""

          if (format_type === "table") {
            // Create markdown table
            const headers = fieldsToShow.join(" | ")
            const separator = fieldsToShow.map(() => "---").join(" | ")
            const rows = records
              .map((record: any) =>
                fieldsToShow
                  .map((field) => {
                    const value = record[field]
                    if (value === null || value === undefined) return "—"
                    if (typeof value === "object") return JSON.stringify(value)
                    return String(value).substring(0, 50)
                  })
                  .join(" | ")
              )
              .join("\n")

            formatted = `${headers}\n${separator}\n${rows}`
          } else if (format_type === "summary") {
            // Create summary statistics
            formatted = records
              .map((record: any, idx: number) => {
                const items = fieldsToShow
                  .map((field) => {
                    const value = record[field]
                    return `• **${field}**: ${value === null || value === undefined ? "N/A" : String(value).substring(0, 100)}`
                  })
                  .join("\n")
                return items
              })
              .join("\n\n")
          } else if (format_type === "list") {
            // Create bulleted list
            formatted = records
              .map((record: any) => {
                const primary = record[fieldsToShow[0]] || "Unnamed"
                const secondary = fieldsToShow.slice(1, 3)
                const details = secondary
                  .map((field) => `${field}: ${record[field] || "N/A"}`)
                  .join(" | ")
                return `• **${primary}** — ${details}`
              })
              .join("\n")
          } else if (format_type === "statistics") {
            // Create statistics summary
            const numRecords = records.length
            const stats: Record<string, any> = {
              "Total Records": numRecords,
            }

            // Calculate field statistics
            fieldsToShow.forEach((field) => {
              const values = records
                .map((r: any) => r[field])
                .filter((v: any) => v !== null && v !== undefined)
              if (values.length > 0) {
                if (typeof values[0] === "number") {
                  const sum = (values as number[]).reduce((a, b) => a + b, 0)
                  stats[`${field} (Total)`] = sum
                  stats[`${field} (Average)`] = (sum / values.length).toFixed(2)
                }
              }
            })

            formatted = Object.entries(stats)
              .map(([key, value]) => `• **${key}**: ${value}`)
              .join("\n")
          }

          return {
            success: true,
            formatted,
            message: title || `Formatted ${records.length} record(s)`,
            recordCount: records.length,
          }
        } catch (error) {
          return {
            error: `Failed to format data: ${error instanceof Error ? error.message : "Unknown error"}`,
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

    // 6. Stream response with GPT-4o-mini via Vercel AI Gateway
    const result = streamText({
      model: "openai/gpt-4o-mini",
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
