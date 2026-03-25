import { NextRequest, NextResponse } from "next/server"
import { verifyOTPToken, createSession } from "@/lib/auth"

interface OTPVerificationRequest {
  sessionId: string
  otp: string
  userId: number
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, otp, userId } = (await request.json()) as OTPVerificationRequest

    if (!sessionId || !otp || !userId) {
      return NextResponse.json(
        { error: "Session ID, OTP, and User ID are required" },
        { status: 400 }
      )
    }

    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      return NextResponse.json(
        { error: "Invalid OTP format. Must be 6 digits." },
        { status: 400 }
      )
    }

    console.log("[v0] Verifying OTP for session:", sessionId.slice(0, 8), "userId:", userId)

    try {
      // Call Odoo's custom OTP verification endpoint
      const success = await verifyOTPToken(sessionId, otp, userId)

      if (success) {
        console.log("[v0] OTP verification successful for userId:", userId)
        // Note: Session creation will be handled by the login form after successful OTP verification
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
