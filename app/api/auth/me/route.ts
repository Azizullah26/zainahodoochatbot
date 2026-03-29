import { getSession, fetchUserName, fetchEmployeeImage, getAllowedTools } from "@/lib/auth"

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
  let image: string | undefined
  
  try {
    name = await fetchUserName(session.uid, session.odooPassword)
  } catch {
    // fallback to uid-based name
  }

  try {
    image = await fetchEmployeeImage(session.uid, session.odooPassword)
  } catch {
    // fallback to no image
  }

  return Response.json({
    success: true,
    user: {
      uid: session.uid,
      name,
      image,
      allowedTools: getAllowedTools(),
    },
  })
}
