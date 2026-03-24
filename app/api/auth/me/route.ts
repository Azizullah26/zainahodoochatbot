import { getSession, fetchUserName, getAllowedTools } from "@/lib/auth"

export async function GET() {
  const session = await getSession()

  if (!session) {
    return Response.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    )
  }

  // Fetch name on demand — not stored in cookie
  let name = `User ${session.uid}`
  try {
    name = await fetchUserName(session.uid, session.odooPassword)
  } catch {
    // fallback to uid-based name
  }

  return Response.json({
    success: true,
    user: {
      uid: session.uid,
      name,
      allowedTools: getAllowedTools(),
    },
  })
}
