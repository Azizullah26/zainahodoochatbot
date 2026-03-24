"use client"

import { useAuth } from "@/components/auth-provider"
import { ChatContainer } from "@/components/chat-container"
import { LoginForm } from "@/components/login-form"
import { Spinner } from "@/components/ui/spinner"

export default function Page() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-8 text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginForm />
  }

  return <ChatContainer />
}
