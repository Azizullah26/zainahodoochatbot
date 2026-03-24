import { authenticateWithOdoo, createSession } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "Username and password required" },
        { status: 400 }
      )
    }

    const user = await authenticateWithOdoo(username, password)
    await createSession(user, password)

    return NextResponse.json(
      {
        success: true,
        user: {
          uid: user.uid,
          username: user.username,
          name: user.name,
          roles: user.roles,
          roleNames: user.roleNames,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed"
    return NextResponse.json(
      { success: false, error: message },
      { status: 401 }
    )
  }
}

