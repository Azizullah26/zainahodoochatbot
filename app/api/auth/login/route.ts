import { authenticateWithOdoo, createSession } from "@/lib/auth"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { username, password } = body

    if (!username || !password) {
      return Response.json(
        { success: false, error: "Username and password are required" },
        { status: 400 }
      )
    }

    // Sanitize inputs
    const sanitizedUsername = String(username).trim().slice(0, 200)
    const sanitizedPassword = String(password).slice(0, 200)

    const user = await authenticateWithOdoo(sanitizedUsername, sanitizedPassword)

    await createSession(user, sanitizedPassword)

    return Response.json({
      success: true,
      user: {
        uid: user.uid,
        username: user.username,
        name: user.name,
        roles: user.roles,
        roleNames: user.roleNames,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication failed"
    return Response.json(
      { success: false, error: message },
      { status: 401 }
    )
  }
}
