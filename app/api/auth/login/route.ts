import { authenticateWithOdoo, createSession } from "@/lib/auth"

export async function POST(req: Request) {
  try {
    console.log("[v0] Login route called")
    const body = await req.json()
    const { username, password } = body

    if (!username || !password) {
      console.log("[v0] Login validation failed: missing credentials")
      return Response.json(
        { success: false, error: "Username and password are required" },
        { status: 400 }
      )
    }

    // Sanitize inputs
    const sanitizedUsername = String(username).trim().slice(0, 200)
    const sanitizedPassword = String(password).slice(0, 200)

    console.log("[v0] Calling authenticateWithOdoo for:", sanitizedUsername)
    const user = await authenticateWithOdoo(sanitizedUsername, sanitizedPassword)
    console.log("[v0] Authentication succeeded:", { uid: user.uid, username: user.username })

    console.log("[v0] Creating session for user:", user.username)
    await createSession(user, sanitizedPassword)
    console.log("[v0] Session created successfully")

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
    console.error("[v0] Login error:", message, error)
    return Response.json(
      { success: false, error: message },
      { status: 401 }
    )
  }
}

