import { NextRequest, NextResponse } from "next/server"
import { verifyOTPToken, createSession } from "@/lib/auth"
import { cookies } from "next/headers"

interface OTPVerificationRequest {
  otp: string
  userId: number
}

export async function POST(request: NextRequest) {
  try {
    const { otp, userId } = (await request.json()) as OTPVerificationRequest

    if (!otp || !userId) {
      return NextResponse.json(
        { error: "OTP and User ID are required" },
        { status: 400 }
      )
    }

    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      return NextResponse.json(
        { error: "Invalid OTP format. Must be 6 digits." },
        { status: 400 }
      )
    }

    // Read session_id from HTTP-only cookie set during login
    const cookieStore = await cookies()
    const sessionId = cookieStore.get("odoo_session_id")?.value

    console.log("[v0] verify-otp: Reading cookie - sessionId found =", !!sessionId, "id =", sessionId?.slice(0, 8))

    if (!sessionId) {
      console.log("[v0] OTP verification failed: No session_id in cookie")
      return NextResponse.json(
        { error: "Session expired. Please login again." },
        { status: 401 }
      )
    }

    console.log("[v0] Verifying OTP for session:", sessionId.slice(0, 8), "userId:", userId)

    try {
      // Call Odoo's custom OTP verification endpoint
      const success = await verifyOTPToken(sessionId, otp, userId)

      if (success) {
        console.log("[v0] OTP verification successful for userId:", userId)
        
        // Clear the OTP session cookie after successful verification
        cookieStore.delete("odoo_session_id")
        
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
