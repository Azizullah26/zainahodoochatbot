"use client"

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from "react"

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch the current user on mount
  useEffect(() => {
    let cancelled = false
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me")
        if (res.ok) {
          const data = await res.json()
          if (!cancelled && data.success) {
            setUser(data.user)
          }
        }
      } catch {
        // not authenticated
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    fetchUser()
    return () => { cancelled = true }
  }, [])

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
      const meRes = await fetch("/api/auth/me")
      if (meRes.ok) {
        const meData = await meRes.json()
        if (meData.success) {
          setUser(meData.user)
        }
      }
    },
    []
  )

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
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
