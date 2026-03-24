import { authenticateWithOdoo, createSession } from "@/lib/auth"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { username, password } = body

    if (!username || !password) {
      return Response.json(
        { success: false, error: "Username and password required" },
        { status: 400 }
      )
    }

    const user = await authenticateWithOdoo(username, password)
    await createSession(user, password)

    // Return success - cookie is set via cookies().set() in createSession
    return Response.json({
      success: true,
      user: {
        uid: user.uid,
        username: user.username,
        name: user.name,
        roles: user.roles,
        roleNames: user.roleNames,
        image: user.image,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed"
    return Response.json(
      { success: false, error: message },
      { status: 401 }
    )
  }
}

