"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth-provider"
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
import { Database, AlertCircle } from "lucide-react"

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
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <Database className="size-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground text-balance">
              Odoo ERP Assistant
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with your Odoo account to continue
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your Odoo credentials below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="username">Email / Username</FieldLabel>
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
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={isPending}
                  />
                </Field>

                {error && (
                  <FieldError>
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="size-3.5 shrink-0" />
                      {error}
                    </span>
                  </FieldError>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isPending || !username || !password}
                >
                  {isPending ? (
                    <>
                      <Spinner className="size-4" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Your credentials are authenticated directly against your Odoo instance.
          We do not store passwords.
        </p>
      </div>
    </div>
  )
}
