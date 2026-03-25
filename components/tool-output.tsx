import {
  FolderKanban,
  Users,
  ListTodo,
  Contact,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface ToolOutputProps {
  toolName: string
  state: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  errorText?: string
}

const toolIcons: Record<string, React.ReactNode> = {
  getProjects: <FolderKanban className="size-4" />,
  getEmployees: <Users className="size-4" />,
  getTasks: <ListTodo className="size-4" />,
  getPartners: <Contact className="size-4" />,
  getTimesheets: <Clock className="size-4" />,
}

const toolLabels: Record<string, string> = {
  getProjects: "Projects",
  getEmployees: "Employees",
  getTasks: "Tasks",
  getPartners: "Partners",
  getTimesheets: "Timesheets",
}

// Friendly field name mappings (hide technical names like employee_id, date_from, etc.)
const fieldDisplayNames: Record<string, string> = {
  id: "ID",
  name: "Name",
  employee_id: "Employee",
  employee: "Employee",
  date_from: "From Date",
  date_to: "To Date",
  state: "Status",
  number_of_days: "Days",
  holiday_status_id: "Type",
  holiday_status: "Type",
  request_date: "Request Date",
  status: "Status",
  date: "Date",
  date_start: "Start Date",
  date_end: "End Date",
  description: "Description",
  user_id: "User",
  project_id: "Project",
  task_id: "Task",
  stage_id: "Stage",
  priority: "Priority",
  company_id: "Company",
  create_date: "Created",
  write_date: "Updated",
}

function getFriendlyFieldName(fieldName: string): string {
  return fieldDisplayNames[fieldName] || fieldName
}

function formatCellValue(value: unknown, fieldName: string): string {
  if (value === null || value === undefined) return "-"
  if (value === false) return "No"
  if (value === true) return "Yes"
  if (typeof value === "number") {
    // For IDs and numeric fields, just show the number
    if (fieldName.includes("_id") || fieldName === "id") {
      return String(value)
    }
    // For decimal fields, limit to 2 places
    if (Number.isInteger(value)) return String(value)
    return Number(value).toFixed(2)
  }
  if (Array.isArray(value)) {
    // For arrays with [id, name] format (Odoo relations), show just the name
    if (Array.isArray(value[0])) {
      return value.map((v: unknown) => (Array.isArray(v) ? v[1] : v)).join(", ")
    }
    if (value.length === 2 && typeof value[0] === "number") {
      return String(value[1]) // Show name, not ID
    }
    return value.join(", ")
  }
  const str = String(value)
  // Truncate very long strings
  if (str.length > 100) return str.substring(0, 97) + "..."
  return str
}

export function ToolOutput({
  toolName,
  state,
  input,
  output,
  errorText,
}: ToolOutputProps) {
  const icon = toolIcons[toolName] || <FolderKanban className="size-4" />
  const label = toolLabels[toolName] || toolName

  if (state === "output-error") {
    return (
      <div className="my-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4" />
          <span className="font-medium">Could not fetch {label.toLowerCase()}</span>
        </div>
        {errorText && (
          <p className="mt-1 text-xs text-destructive/80">
            {/* Hide technical Odoo errors, show generic message */}
            {errorText.includes("Invalid field") 
              ? "Some fields are not available for this data type."
              : errorText.length > 150
              ? errorText.substring(0, 150) + "..."
              : errorText}
          </p>
        )}
      </div>
    )
  }

  if (state === "input-streaming" || state === "input-available") {
    return (
      <div className="my-2 rounded-lg border border-border bg-muted/50 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>Fetching {label.toLowerCase()}...</span>
        </div>
      </div>
    )
  }

  if (state === "output-available" && output) {
    const success = output.success as boolean
    const count = output.count as number
    const data = output.data as Record<string, unknown>[] | undefined

    if (!success) {
      return (
        <div className="my-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            <span className="font-medium">
              Could not fetch {label.toLowerCase()}
            </span>
          </div>
          {!!output.error && (
            <p className="mt-1 text-xs text-destructive/80">
              {String(output.error).length > 150
                ? String(output.error).substring(0, 150) + "..."
                : String(output.error)}
            </p>
          )}
        </div>
      )
    }

    return (
      <div className="my-2 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-primary">{icon}</span>
          <span className="font-medium text-foreground">{label}</span>
          <Badge variant="secondary" className="text-xs">
            {count} {count === 1 ? "record" : "records"}
          </Badge>
        </div>

        {/* Show data table if available */}
        {data && data.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <div className="inline-block min-w-full rounded-md border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {Object.keys(data[0]).map((key) => (
                      <th
                        key={key}
                        className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap"
                      >
                        {getFriendlyFieldName(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/30 hover:bg-muted/20 transition-colors last:border-0"
                    >
                      {Object.entries(row).map(([key, val]) => (
                        <td
                          key={key}
                          className="px-3 py-2 text-foreground whitespace-nowrap"
                        >
                          {formatCellValue(val, key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Show summary message */}
        {data && data.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Found {count} {label.toLowerCase()} for you.
          </p>
        )}
      </div>
    )
  }

  return null
}
