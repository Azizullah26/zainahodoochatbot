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

function formatFilters(input: Record<string, unknown>): string[] {
  return Object.entries(input)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`)
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
  const filters = input ? formatFilters(input) : []

  if (state === "output-error") {
    return (
      <div className="my-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4" />
          <span className="font-medium">Error fetching {label}</span>
        </div>
        {errorText && (
          <p className="mt-1 text-xs text-destructive/80">{errorText}</p>
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
          {filters.length > 0 && (
            <span className="text-xs">
              ({filters.join(", ")})
            </span>
          )}
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
              Failed to fetch {label.toLowerCase()}
            </span>
          </div>
          {output.error && (
            <p className="mt-1 text-xs text-destructive/80">
              {String(output.error)}
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
        {filters.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {filters.map((f) => (
              <Badge
                key={f}
                variant="outline"
                className="text-xs font-normal text-muted-foreground"
              >
                {f}
              </Badge>
            ))}
          </div>
        )}
        {data && data.length > 0 && data.length <= 8 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {Object.keys(data[0]).slice(0, 5).map((key) => (
                    <th
                      key={key}
                      className="px-2 py-1 text-left font-medium text-muted-foreground"
                    >
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    {Object.values(row).slice(0, 5).map((val, j) => (
                      <td
                        key={j}
                        className="max-w-[200px] truncate px-2 py-1 text-foreground"
                      >
                        {Array.isArray(val)
                          ? val.join(", ")
                          : val === false
                            ? "-"
                            : String(val ?? "-")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return null
}
