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
  username?: string
  name: string
  allowedTools: string[]
  image?: string
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
        const res = await fetch("/api/auth/me", { credentials: "include" })
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
        credentials: "include",
      })

      const responseText = await res.text()
      let data

      try {
        data = JSON.parse(responseText)
      } catch (err) {
        throw new Error(`Server error: ${responseText.slice(0, 100)}`)
      }

      if (!data.success) {
        throw new Error(data.error || "Login failed")
      }

      // Set user immediately from login response (has name + image)
      // image is returned by login but NOT stored in cookie — lives in React state only
      setUser({
        uid: data.user.uid,
        username: data.user.username,
        name: data.user.name,
        image: data.user.image,
        allowedTools: ["search_read", "read_group", "name_search", "calculator"],
      })

      // Fetch /api/auth/me to confirm session cookie was set correctly
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "include" })
        if (meRes.ok) {
          const meData = await meRes.json()
          if (meData.success && meData.user) {
            // Merge: keep image from login response, update name/tools from session
            setUser((prev) => ({ ...prev!, ...meData.user, image: data.user.image }))
          }
        }
      } catch {
        // Continue with login response data
      }
    },
    []
  )

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
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
