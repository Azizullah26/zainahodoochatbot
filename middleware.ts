import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifyJwt } from "@/lib/jwt"

const SESSION_COOKIE = "odoo_session"

// Routes that do NOT require authentication
const PUBLIC_PATHS = ["/api/auth/login", "/api/auth/me", "/api/auth/logout"]

function getJwtSecret() {
  const ODOO_URL = process.env.ODOO_URL || ""
  const ODOO_DB = process.env.ODOO_DB || ""
  const raw = process.env.JWT_SECRET || `${ODOO_URL}-${ODOO_DB}-odoo-erp-assistant`
  return new TextEncoder().encode(raw)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Only protect /api/* routes (except auth/login)
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  // Check for session token
  const token = request.cookies.get(SESSION_COOKIE)?.value

  if (!token) {
    return Response.json(
      { success: false, error: "Authentication required" },
      { status: 401 }
    )
  }

  try {
    const secret = getJwtSecret()
    const { payload } = await verifyJwt(token, secret)

    // Attach user info to request headers for downstream use
    const response = NextResponse.next()
    response.headers.set("x-user-uid", String(payload.uid))
    response.headers.set("x-user-username", String(payload.username))
    response.headers.set("x-user-name", String(payload.name))
    response.headers.set(
      "x-user-roles",
      JSON.stringify(payload.roles || [])
    )

    return response
  } catch {
    // Invalid or expired token
    return Response.json(
      { success: false, error: "Session expired. Please log in again." },
      { status: 401 }
    )
  }
}

export const config = {
  matcher: ["/api/:path*"],
}
