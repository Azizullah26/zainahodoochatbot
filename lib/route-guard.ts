import { getSession, resolveAppRoles, type AppRole } from "@/lib/auth"

/**
 * Verifies the user session and checks if they have at least one of the required roles.
 * Returns the session if authorized, or a Response to send back if not.
 */
export async function requireRole(
  ...requiredRoles: AppRole[]
): Promise<
  | { authorized: true; uid: number; username: string; roles: AppRole[] }
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

  // Check if user has at least one of the required roles
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

  return { authorized: true, uid: session.uid, username: session.username, roles: appRoles }
}
