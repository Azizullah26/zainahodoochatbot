import { Button } from "@/components/ui/button"
import {
  FolderKanban,
  Users,
  ListTodo,
  Contact,
  Clock,
} from "lucide-react"

const suggestions = [
  {
    label: "Show active projects",
    icon: FolderKanban,
    query: "Show me all active projects",
  },
  {
    label: "List employees",
    icon: Users,
    query: "List all employees with their departments",
  },
  {
    label: "View tasks",
    icon: ListTodo,
    query: "Show me all project tasks",
  },
  {
    label: "Find contacts",
    icon: Contact,
    query: "List all company partners",
  },
  {
    label: "Recent timesheets",
    icon: Clock,
    query: "Show recent timesheet entries",
  },
]

interface ChatSuggestionsProps {
  onSelect: (query: string) => void
}

export function ChatSuggestions({ onSelect }: ChatSuggestionsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground text-balance">
          What would you like to know?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask about your Odoo ERP data in natural language
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
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
