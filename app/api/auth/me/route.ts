import { getSession, getAllowedTools } from "@/lib/auth"

export async function GET() {
  const session = await getSession()

  if (!session) {
    return Response.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    )
  }

  // Roles are not stored in cookie (too large) — any authenticated user gets full access
  const allowedTools = getAllowedTools([])

  return Response.json({
    success: true,
    user: {
      uid: session.uid,
      username: session.username,
      name: session.name,
      allowedTools,
    },
  })
}
