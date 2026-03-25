import { checkLoginWith2FA, createSession } from "@/lib/auth"

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
      // Use the custom 2FA endpoint that returns session_id and 2FA status
      const loginResult = await checkLoginWith2FA(username, password)

      console.log("[v0] Login check result:", {
        uid: loginResult.uid,
        totp_enabled: loginResult.totp_enabled,
        has_session: !!loginResult.session_id,
      })

      // If 2FA is enabled, return the 2FA required flag with session info
      if (loginResult.totp_enabled) {
        return Response.json(
          {
            success: false,
            requires2FA: true,
            sessionId: loginResult.session_id,
            userId: loginResult.uid,
            email: username,
            error: "2FA verification required",
          },
          { status: 401 }
        )
      }

      // If 2FA is not enabled but QR code is present, return setup required
      if (loginResult.qr_code) {
        return Response.json(
          {
            success: false,
            requires2FASetup: true,
            sessionId: loginResult.session_id,
            userId: loginResult.uid,
            qrCode: loginResult.qr_code,
            email: username,
            error: "2FA setup required",
          },
          { status: 401 }
        )
      }

      // If no 2FA, create session and login user
      // For now, store the session ID and password for later authenticated API calls
      await createSession(loginResult.uid, password)

      return Response.json({
        success: true,
        user: { uid: loginResult.uid, username, name: username },
      })
    } catch (authError) {
      const errorMessage = authError instanceof Error ? authError.message : "Authentication failed"
      console.log("[v0] Login error:", errorMessage)
      return Response.json(
        { success: false, error: errorMessage },
        { status: 401 }
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed"
    console.log("[v0] Login endpoint error:", message)
    return Response.json({ success: false, error: message }, { status: 401 })
  }
}
