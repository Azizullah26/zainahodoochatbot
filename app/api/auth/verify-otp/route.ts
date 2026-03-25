import { NextRequest, NextResponse } from "next/server"

interface OTPVerificationRequest {
  email: string
  otp: string
}

export async function POST(request: NextRequest) {
  try {
    const { email, otp } = (await request.json()) as OTPVerificationRequest

    if (!email || !otp) {
      return NextResponse.json(
        { error: "Email and OTP are required" },
        { status: 400 }
      )
    }

    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      return NextResponse.json(
        { error: "Invalid OTP format. Must be 6 digits." },
        { status: 400 }
      )
    }

    const odooUrl = process.env.NEXT_PUBLIC_ODOO_URL
    if (!odooUrl) {
      console.error("[v0] NEXT_PUBLIC_ODOO_URL not configured")
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }

    // Call Odoo API to verify OTP
    // This endpoint should handle 2FA OTP validation
    const response = await fetch(`${odooUrl}/api/auth/verify-2fa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        otp,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[v0] OTP verification failed:", errorData)

      if (response.status === 401) {
        return NextResponse.json(
          { error: "Invalid or expired OTP. Please try again." },
          { status: 401 }
        )
      }

      return NextResponse.json(
        {
          error:
            errorData?.error ||
            "Failed to verify OTP. Please check your code and try again.",
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json(
      {
        success: true,
        session: data.session,
        user: data.user,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[v0] OTP verification error:", error)
    return NextResponse.json(
      { error: "An error occurred during OTP verification" },
      { status: 500 }
    )
  }
}
