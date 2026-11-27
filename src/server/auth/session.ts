import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

const prod = process.env.NODE_ENV === "production";
// __Host- prefix: Secure, Path=/, no Domain attribute (cannot be overwritten from subdomains).
const COOKIE = prod ? "__Host-gjs_session" : "gjs_session";
const MAX_AGE = 60 * 60 * 8;

const key = () => new TextEncoder().encode(getEnv().SESSION_SECRET);

export type SessionClaims = { userId: string; sessionVersion: number };

export async function createSession(claims: SessionClaims) {
  const token = await new SignJWT({ sv: claims.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: prod, sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}

export async function readSession(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sv !== "number") return null;
    return { userId: payload.sub, sessionVersion: payload.sv };
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}
