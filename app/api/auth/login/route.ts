import { authenticateWithOdoo, createSession } from "@/lib/auth"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { username, password } = body

    if (!username || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "Username and password required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const user = await authenticateWithOdoo(username, password)
    
    try {
      await createSession(user, password)
    } catch (sessionErr) {
      console.error("[v0] Session creation failed:", sessionErr)
      throw new Error("Failed to create session")
    }

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

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed"
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }
}

