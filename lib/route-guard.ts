import { getSession, resolveAppRoles, type AppRole } from "@/lib/auth"

/**
 * Verifies the user session and checks if they have at least one of the required roles.
 * Returns the session credentials (uid + odooPassword) if authorized,
 * so downstream Odoo calls can use the authenticated user's identity.
 */
export async function requireRole(
  ...requiredRoles: AppRole[]
): Promise<
  | { authorized: true; uid: number; password: string; username: string; roles: AppRole[] }
  | { authorized: false; response: Response }
> {
  const session = await getSession()

  if (!session) {
    return {
      authorized: false,
      response: Response.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      ),
    }
  }

  const appRoles = resolveAppRoles(session.roles)

  const hasAccess = requiredRoles.some((r) => appRoles.includes(r))

  if (!hasAccess) {
    return {
      authorized: false,
      response: Response.json(
        { success: false, error: "Access denied: insufficient permissions" },
        { status: 403 }
      ),
    }
  }

  return {
    authorized: true,
    uid: session.uid,
    password: session.odooPassword,
    username: session.username,
    roles: appRoles,
  }
}
