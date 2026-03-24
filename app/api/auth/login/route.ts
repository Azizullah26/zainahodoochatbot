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
    try {
      await createSession(user, sanitizedPassword)
      console.log("[v0] Session created successfully")
    } catch (sessionErr) {
      console.error("[v0] Session creation error:", sessionErr)
      throw sessionErr
    }

    console.log("[v0] Building JSON response")
    const responseBody = {
      success: true,
      user: {
        uid: user.uid,
        username: user.username,
        name: user.name,
        roles: user.roles,
        roleNames: user.roleNames,
      },
    }
    console.log("[v0] Response body:", responseBody)

    console.log("[v0] Creating Response.json")
    const response = Response.json(responseBody)
    console.log("[v0] Response created successfully")
    return response
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication failed"
    console.error("[v0] Login error:", message, error)
    try {
      return Response.json(
        { success: false, error: message },
        { status: 401 }
      )
    } catch (responseErr) {
      console.error("[v0] Failed to return error response:", responseErr)
      throw responseErr
    }
  }
}

