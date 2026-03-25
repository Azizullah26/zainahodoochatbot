"use client"

import { useAuth } from "@/components/auth-provider"
import { LogOut, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Image from "next/image"

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
    <header className="flex items-center justify-between border-b border-primary/20 bg-card/40 backdrop-blur-sm px-6 py-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center overflow-hidden ring-2 ring-primary/30 glow-primary">
          <Image
            src="/logo.png"
            alt="ELRACE Logo"
            width={60}
            height={30}
            className="h-auto w-auto max-w-[60px]"
            priority
          />
        </div>
        <div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent text-balance">
            ELRACE Odoo Assistant
          </h1>
          <p className="text-xs text-muted-foreground">
            Query projects, employees, tasks & more
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className="gap-1.5 text-xs border-primary/30 bg-primary/10">
          <Zap className="size-3 text-primary" />
          <span>Connected</span>
        </Badge>

        {user && (
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex sm:items-center">
              <span className="text-sm font-medium text-foreground leading-none">
                {user.name}
              </span>
            </div>

            <Avatar className="size-8 border-2 border-primary/40 ring-1 ring-primary/20">
              <AvatarImage src={user.image} alt={user.name} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-background text-xs font-semibold">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>

            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="size-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
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
