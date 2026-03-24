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

    const { uid, name, image } = await authenticateWithOdoo(username, password)

    // Store ONLY uid + password in the cookie (~150 bytes, well under 4096 limit)
    await createSession(uid, password)

    return Response.json({
      success: true,
      user: { uid, username, name, image },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed"
    return Response.json({ success: false, error: message }, { status: 401 })
  }
}
