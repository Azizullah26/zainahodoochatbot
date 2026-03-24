import { getSession, resolveAppRoles, getAllowedTools } from "@/lib/auth"

export async function GET() {
  const session = await getSession()

  if (!session) {
    return Response.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    )
  }

  const appRoles = resolveAppRoles(session.roles)
  const allowedTools = getAllowedTools(appRoles)

  return Response.json({
    success: true,
    user: {
      uid: session.uid,
      username: session.username,
      name: session.name,
      roles: session.roles,
      appRoles,
      allowedTools,
    },
  })
}
