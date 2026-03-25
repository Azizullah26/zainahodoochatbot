"use client"

import { useAuth } from "@/components/auth-provider"
import { LogOut, Zap, Building2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function ChatHeader() {
  const { user, logout } = useAuth()

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Building2 className="size-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground text-balance">
            Elrace Odoo | Assistant
          </h1>
          <p className="text-sm text-muted-foreground">
            Query projects, employees, tasks & more
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className="gap-1.5 text-xs">
          <Zap className="size-3 text-chart-2" />
          <span>Connected</span>
        </Badge>

        {user && (
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex sm:items-center">
              <span className="text-sm font-medium text-foreground leading-none">
                {user.name}
              </span>
            </div>

            <Avatar className="size-8 border border-border">
              <AvatarImage src={user.image} alt={user.name} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>

            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="size-8 text-muted-foreground hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
