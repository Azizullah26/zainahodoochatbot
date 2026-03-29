"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth-provider"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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
  const [requires2FA, setRequires2FA] = useState(false)
  const [sessionId, setSessionId] = useState<string>("")
  const [userId, setUserId] = useState<number>(0)
  const [otp, setOtp] = useState("")
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsPending(true)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include HTTP-only cookies in the response
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.requires2FA) {
          setSessionId(data.sessionId)
          setUserId(data.userId)
          setRequires2FA(true)
          setError("")
          setIsPending(false)
          return
        }
        throw new Error(data.error || "Login failed")
      }

      await login(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
      setIsPending(false)
    }
  }

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!otp || otp.length !== 6) {
      setOtpError("Please enter a valid 6-digit code")
      return
    }

    setOtpLoading(true)
    setOtpError("")

    try {
      // Send OTP with sessionId (2FA session from Redis) and userId
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otp, userId, sessionId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "OTP verification failed")
      }

      // OTP verified, complete the login
      await login(username, password)
      
      // Reset form and state
      setRequires2FA(false)
      setOtp("")
      setSessionId("")
      setUserId(0)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "OTP verification failed"
      setOtpError(errorMsg)
    } finally {
      setOtpLoading(false)
    }
  }

  const handleCancelOTP = () => {
    setRequires2FA(false)
    setOtp("")
    setSessionId("")
    setUserId(0)
    setOtpError("")
    setError("")
  }

  // Show OTP screen
  if (requires2FA) {
    return (
      <div className="relative min-h-dvh overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-[#051428] to-[#0a2540] opacity-90" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl opacity-40 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/10 rounded-full blur-3xl opacity-40 animate-pulse [animation-delay:1s]" />
        
        <div className="relative flex min-h-dvh items-center justify-center px-4">
          <div className="w-full max-w-md">
            <div className="mb-8 flex flex-col items-center gap-4">
              <div className="text-center">
                <h1 className="text-3xl font-bold text-balance bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Two-Factor Authentication
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter the 6-digit code from your Microsoft Authenticator
                </p>
              </div>
            </div>

            <Card className="relative border-primary/50 bg-background/30 backdrop-blur-xl shadow-2xl">
              <CardContent className="pt-6">
                <form onSubmit={handleOTPSubmit}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="otp" className="text-foreground/90">
                        Verification Code
                      </FieldLabel>
                      <Input
                        id="otp"
                        type="text"
                        inputMode="numeric"
                        placeholder="000000"
                        value={otp}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 6)
                          setOtp(val)
                        }}
                        maxLength={6}
                        disabled={otpLoading}
                        className="text-center text-2xl tracking-widest font-mono border-primary/40 bg-background/50"
                        autoFocus
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {otp.length}/6 digits
                      </p>
                    </Field>

                    {otpError && (
                      <FieldError className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                        <span className="flex items-center gap-2 text-destructive">
                          <AlertCircle className="size-4 shrink-0" />
                          <span className="text-sm">{otpError}</span>
                        </span>
                      </FieldError>
                    )}

                    <div className="flex gap-3 pt-4">
                      <Button
                        type="submit"
                        disabled={otpLoading || otp.length !== 6}
                        className="flex-1 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
                      >
                        {otpLoading ? (
                          <>
                            <Spinner className="size-4 mr-2" />
                            Verifying...
                          </>
                        ) : (
                          "Verify"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancelOTP}
                        disabled={otpLoading}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  // Show login screen
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-[#051428] to-[#0a2540] opacity-90" />
      
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl opacity-40 animate-pulse" />
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/10 rounded-full blur-3xl opacity-40 animate-pulse [animation-delay:1s]" />

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

      <div className="relative flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center gap-4">
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
