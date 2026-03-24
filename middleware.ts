import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const SESSION_COOKIE = "sid"
const SESSION_KEY_PREFIX = "session:"

// Routes that do NOT require authentication
const PUBLIC_PATHS = ["/api/auth/login", "/api/auth/me", "/api/auth/logout"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths and non-API routes through
  if (!pathname.startsWith("/api/") || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Check for session ID cookie
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value
  if (!sessionId) {
    return Response.json(
      { success: false, error: "Authentication required" },
      { status: 401 }
    )
  }

  // Validate session exists in Redis
  try {
    const raw = await redis.get(`${SESSION_KEY_PREFIX}${sessionId}`)
    if (!raw) {
      return Response.json(
        { success: false, error: "Session expired. Please log in again." },
        { status: 401 }
      )
    }

    const session = typeof raw === "string" ? JSON.parse(raw) : raw
    const response = NextResponse.next()
    response.headers.set("x-user-uid", String(session.uid))
    return response
  } catch {
    return Response.json(
      { success: false, error: "Session validation failed." },
      { status: 401 }
    )
  }
}

export const config = {
  matcher: ["/api/:path*"],
}
