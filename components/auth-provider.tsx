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
      console.log("[v0] Login initiated for:", username)
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      console.log("[v0] Login response status:", res.status)
      
      let data
      try {
        data = await res.json()
      } catch (err) {
        console.error("[v0] Failed to parse login response as JSON:", err)
        throw new Error("Login failed: Invalid response from server")
      }
      
      console.log("[v0] Login response:", data)

      if (!data.success) {
        throw new Error(data.error || "Login failed")
      }

      // Set user data immediately from login response
      if (data.user) {
        setUser(data.user)
      }

      // Re-fetch user data with full app roles and allowed tools
      try {
        const meRes = await fetch("/api/auth/me")
        console.log("[v0] /api/auth/me status:", meRes.status)
        
        if (meRes.ok) {
          let meData
          try {
            meData = await meRes.json()
          } catch (err) {
            console.error("[v0] Failed to parse /api/auth/me as JSON:", err)
            return // Use data from login response if /me fails
          }
          
          if (meData.success && meData.user) {
            console.log("[v0] Setting user from /api/auth/me:", meData.user)
            setUser(meData.user)
          }
        }
      } catch (err) {
        console.error("[v0] Error fetching /api/auth/me:", err)
        // Continue with user from login response
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
