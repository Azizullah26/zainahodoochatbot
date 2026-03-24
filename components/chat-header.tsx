import { Database, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function ChatHeader() {
  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Database className="size-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground text-balance">
            Odoo ERP Assistant
          </h1>
          <p className="text-sm text-muted-foreground">
            Query projects, employees, tasks & more
          </p>
        </div>
      </div>
      <Badge variant="outline" className="gap-1.5 text-xs">
        <Zap className="size-3 text-chart-2" />
        <span>Connected</span>
      </Badge>
    </header>
  )
}
