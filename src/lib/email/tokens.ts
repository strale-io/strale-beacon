/**
 * Simple HMAC-based tokens for unsubscribe links.
 * Not a full JWT — just enough to verify the email+domain pair.
 */

import { createHmac } from "crypto";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return secret;
}

export function signUnsubscribeToken(email: string, domain: string): string {
  const payload = JSON.stringify({ email, domain });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): { email: string; domain: string } | null {
  try {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return null;

    const expectedSig = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
    if (sig !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (!payload.email || !payload.domain) return null;

    return { email: payload.email, domain: payload.domain };
  } catch {
    return null;
  }
}
