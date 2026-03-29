import { NextRequest, NextResponse } from "next/server"
import { verifyOTPToken, getTwoFASession, destroyTwoFASession } from "@/lib/auth"

interface OTPVerificationRequest {
  otp: string
  userId: number
  sessionId: string
}

export async function POST(request: NextRequest) {
  try {
    const { otp, userId, sessionId } = (await request.json()) as OTPVerificationRequest

    if (!otp || !userId || !sessionId) {
      return NextResponse.json(
        { error: "OTP, User ID, and Session ID are required" },
        { status: 400 }
      )
    }

    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      return NextResponse.json(
        { error: "Invalid OTP format. Must be 6 digits." },
        { status: 400 }
      )
    }

    console.log("[v0] verify-otp: Looking up 2FA session:", sessionId.slice(0, 8))

    try {
      // Retrieve Odoo session_id from Redis-backed 2FA session
      const twoFASession = await getTwoFASession(sessionId)

      if (!twoFASession) {
        console.log("[v0] OTP verification failed: 2FA session not found or expired")
        return NextResponse.json(
          { error: "Session expired. Please login again." },
          { status: 401 }
        )
      }

      console.log("[v0] verify-otp: Found 2FA session, Odoo session:", twoFASession.odooSessionId.slice(0, 8))

      // Verify OTP with Odoo using the retrieved session
      const success = await verifyOTPToken(twoFASession.odooSessionId, otp, userId)

      if (success) {
        console.log("[v0] OTP verification successful for userId:", userId)
        
        // Destroy the 2FA session after successful verification
        await destroyTwoFASession(sessionId)
        
        return NextResponse.json(
          {
            success: true,
            message: "OTP verified successfully",
          },
          { status: 200 }
        )
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "OTP verification failed"
      console.log("[v0] OTP verification error:", errorMessage)

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 401 }
      )
    }
  } catch (error) {
    console.error("[v0] OTP verification error:", error)
    return NextResponse.json(
      { error: "An error occurred during OTP verification" },
      { status: 500 }
    )
  }
}
