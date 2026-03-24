"use client"

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import useSWR from "swr"

interface AuthUser {
  uid: number
  username: string
  name: string
  roles: string[]
  roleNames: string[]
  appRoles: string[]
  allowedTools: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  return data.success ? data.user : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, mutate } = useSWR<AuthUser | null>(
    "/api/auth/me",
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      fallbackData: null,
    }
  )

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || "Login failed")
      }

      // Re-fetch user data (which includes appRoles and allowedTools from /me)
      await mutate()
    },
    [mutate]
  )

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    await mutate(null, { revalidate: false })
  }, [mutate])

  const value = useMemo(
    () => ({
      user: user ?? null,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
    }),
    [user, isLoading, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
