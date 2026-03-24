// Zero-dependency JWT implementation using Web Crypto API
// Supports HS256 signing and verification

function base64UrlEncode(data: Uint8Array): string {
  let binary = ""
  for (const byte of data) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/")
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  const binary = atob(padded + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const encoder = new TextEncoder()

async function getKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

export async function signJwt(
  payload: Record<string, unknown>,
  secret: Uint8Array,
  expiresInSeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })))
  const body = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)))
  const signingInput = `${header}.${body}`

  const key = await getKey(secret)
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput))

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`
}

export async function verifyJwt<T = Record<string, unknown>>(
  token: string,
  secret: Uint8Array
): Promise<{ payload: T }> {
  const parts = token.split(".")
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format")
  }

  const [header, body, sig] = parts
  const signingInput = `${header}.${body}`

  const key = await getKey(secret)
  const signatureBytes = base64UrlDecode(sig)
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(signingInput)
  )

  if (!valid) {
    throw new Error("Invalid JWT signature")
  }

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as T & { exp?: number }

  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("JWT expired")
  }

  return { payload: payload as T }
}
