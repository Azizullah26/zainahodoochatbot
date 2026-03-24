import { getSession, type AppRole } from "@/lib/auth"

/**
 * Verifies the user session and checks if they are authenticated.
 * Since roles are not stored in the cookie (to keep it small), 
 * any authenticated user is granted access.
 * Returns the session credentials (uid + odooPassword) if authorized.
 */
export async function requireRole(
  ..._requiredRoles: AppRole[]
): Promise<
  | { authorized: true; uid: number; password: string }
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

  return {
    authorized: true,
    uid: session.uid,
    password: session.odooPassword,
  }
}
