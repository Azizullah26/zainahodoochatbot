"use client"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import {
  FolderKanban,
  Users,
  ListTodo,
  Contact,
  Clock,
  Zap,
  Calendar,
  FileText,
  Receipt,
  type LucideIcon,
} from "lucide-react"

interface Suggestion {
  label: string
  icon: LucideIcon
  query: string
  requiredTool: string
}

const allSuggestions: Suggestion[] = [
  {
    label: "Show active projects",
    icon: FolderKanban,
    query: "Show me all active projects",
    requiredTool: "getProjects",
  },
  {
    label: "List employees",
    icon: Users,
    query: "List all employees with their departments",
    requiredTool: "getEmployees",
  },
  {
    label: "View tasks",
    icon: ListTodo,
    query: "Show me all project tasks",
    requiredTool: "getTasks",
  },
  {
    label: "Find contacts",
    icon: Contact,
    query: "List all company partners",
    requiredTool: "getPartners",
  },
  {
    label: "Recent timesheets",
    icon: Clock,
    query: "Show recent timesheet entries",
    requiredTool: "getTimesheets",
  },
  {
    label: "My Requests",
    icon: FileText,
    query: "Show me my pending requests",
    requiredTool: "getRequests",
  },
  {
    label: "My Annual Leave Request",
    icon: Calendar,
    query: "Show my annual leave requests and balance",
    requiredTool: "getLeaveRequests",
  },
  {
    label: "My Sick Leave Request",
    icon: Calendar,
    query: "Show my sick leave requests",
    requiredTool: "getLeaveRequests",
  },
  {
    label: "My Expenses",
    icon: Receipt,
    query: "Show my submitted expenses and reimbursements",
    requiredTool: "getExpenses",
  },
]

interface ChatSuggestionsProps {
  onSelect: (query: string) => void
}

export function ChatSuggestions({ onSelect }: ChatSuggestionsProps) {
  const { user } = useAuth()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground text-balance">
          What would you like to know?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask about your Odoo ERP data in natural language
        </p>
        {user && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Signed in as {user.name}
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {allSuggestions.map((s) => (
          <Button
            key={s.label}
            variant="outline"
            className="gap-2 text-sm"
            onClick={() => onSelect(s.query)}
          >
            <s.icon className="size-4 text-primary" />
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
