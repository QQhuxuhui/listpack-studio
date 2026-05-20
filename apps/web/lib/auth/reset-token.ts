/**
 * Password-reset JWTs.
 *
 * One-shot tokens signed with `RESET_SECRET ?? AUTH_SECRET` and a typ
 * claim so they can't be confused with session JWTs. TTL 1 hour — long
 * enough for the user to fish the email out of spam, short enough that a
 * stolen one mostly expires before the attacker uses it.
 */

import { SignJWT, jwtVerify } from 'jose';

const TOKEN_TYPE = 'pwreset';
const TOKEN_TTL = '1h';

/**
 * Lazy key derivation — read env on first use so tests can set
 * AUTH_SECRET before invoking signResetToken.
 */
function getSecret(): Uint8Array {
  const seed =
    process.env.RESET_SECRET ?? process.env.AUTH_SECRET ?? '';
  if (seed.length === 0) {
    throw new Error(
      'RESET_SECRET (or AUTH_SECRET) must be set to issue password-reset tokens',
    );
  }
  return new TextEncoder().encode(seed);
}

export async function signResetToken(userId: string): Promise<string> {
  return new SignJWT({ user: { id: userId }, typ: TOKEN_TYPE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecret());
}

export async function verifyResetToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ['HS256'],
  });
  if (payload.typ !== TOKEN_TYPE) {
    throw new Error(`token typ mismatch: expected ${TOKEN_TYPE}`);
  }
  const id = (payload.user as { id?: string } | undefined)?.id;
  if (!id) {
    throw new Error('token missing user.id');
  }
  return id;
}
