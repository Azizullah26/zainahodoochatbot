"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth-provider"
import Image from "next/image"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { AlertCircle } from "lucide-react"

export function LoginForm() {
  const { login } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsPending(true)

    try {
      await login(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Animated gradient background with video overlay effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-[#051428] to-[#0a2540] opacity-90" />
      
      {/* Glowing orbs for futuristic effect */}
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl opacity-40 animate-pulse" />
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/10 rounded-full blur-3xl opacity-40 animate-pulse [animation-delay:1s]" />

      {/* Animated grid pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-primary" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Main content */}
      <div className="relative flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Logo and Title */}
          <div className="mb-8 flex flex-col items-center gap-4">
            <div className="relative flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="ELRACE Logo"
                width={120}
                height={60}
                priority
                className="h-auto w-auto"
              />
            </div>
            <div className="text-center">
              <h1 className="text-4xl font-bold text-balance bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                ELRACE
              </h1>
              <p className="mt-2 text-lg font-semibold text-foreground">
                Odoo Assistant
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Query projects, employees, tasks & more
              </p>
            </div>
          </div>

          {/* Glassmorphism Card */}
          <Card className="relative border-primary/50 bg-background/30 backdrop-blur-xl shadow-2xl glow-primary">
            <CardHeader className="pb-4">
              <CardDescription className="text-foreground/70">
                Enter your Odoo credentials below
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="username" className="text-foreground/90">
                      Email address
                    </FieldLabel>
                    <Input
                      id="username"
                      type="text"
                      placeholder="you@company.com"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoComplete="username"
                      autoFocus
                      disabled={isPending}
                      className="input-glow border-primary/40 bg-background/50 placeholder:text-muted-foreground/50 text-foreground focus:border-primary focus:bg-background/70"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="password" className="text-foreground/90">
                      Password
                    </FieldLabel>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      disabled={isPending}
                      className="input-glow border-primary/40 bg-background/50 placeholder:text-muted-foreground/50 text-foreground focus:border-primary focus:bg-background/70"
                    />
                  </Field>

                  {error && (
                    <FieldError className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                      <span className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="size-4 shrink-0" />
                        <span className="text-sm">{error}</span>
                      </span>
                    </FieldError>
                  )}

                  <div className="pt-2">
                    <Button
                      type="submit"
                      className="w-full button-glow bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-background font-semibold rounded-lg py-6 text-lg transition-all duration-300"
                      disabled={isPending || !username || !password}
                    >
                      {isPending ? (
                        <>
                          <Spinner className="size-5 mr-2" />
                          Signing in...
                        </>
                      ) : (
                        "Login"
                      )}
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>

          <p className="mt-8 text-center text-xs text-muted-foreground/70">
            Your credentials are authenticated directly against your Odoo instance.
            <br />
            We do not store passwords.
          </p>
        </div>
      </div>
    </div>
  )
}
