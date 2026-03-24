import { getSession, resolveAppRoles, getAllowedTools } from "@/lib/auth"

export async function GET() {
  const session = await getSession()
  console.log("[v0] /api/auth/me: Session exists:", !!session)

  if (!session) {
    console.log("[v0] /api/auth/me: No session - returning 401")
    return Response.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    )
  }

  const appRoles = resolveAppRoles(session.roles)
  const allowedTools = getAllowedTools(appRoles)

  console.log("[v0] /api/auth/me: Returning user data for:", session.username)

  return Response.json({
    success: true,
    user: {
      uid: session.uid,
      username: session.username,
      name: session.name,
      roles: session.roles,
      roleNames: session.roleNames,
      appRoles,
      allowedTools,
    },
  })
}
