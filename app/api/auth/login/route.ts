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

    try {
      const { uid, name, image } = await authenticateWithOdoo(username, password)

      // Store ONLY uid + password in the cookie (~150 bytes, well under 4096 limit)
      await createSession(uid, password)

      return Response.json({
        success: true,
        user: { uid, username, name, image },
      })
    } catch (authError) {
      const errorMessage = authError instanceof Error ? authError.message : "Authentication failed"
      console.log("[v0] Login error:", errorMessage)
      
      // Check if 2FA is required (Odoo returns specific error for 2FA)
      // Common Odoo 2FA error messages:
      // - "Access Denied: Verification code required"
      // - "Verification code required"
      // - "2FA verification required"
      // - "TOTP verification required"
      if (
        errorMessage.toLowerCase().includes("verification") ||
        errorMessage.toLowerCase().includes("2fa") ||
        errorMessage.toLowerCase().includes("two-factor") ||
        errorMessage.toLowerCase().includes("totp") ||
        errorMessage.toLowerCase().includes("authenticator")
      ) {
        console.log("[v0] 2FA required detected")
        return Response.json(
          {
            success: false,
            error: errorMessage,
            requires2FA: true,
            email: username,
          },
          { status: 401 }
        )
      }

      throw authError
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed"
    console.log("[v0] Login endpoint error:", message)
    return Response.json({ success: false, error: message }, { status: 401 })
  }
}
