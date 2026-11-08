import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => hash(plain, OPTIONS);

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

/** A pre-computed hash used to equalise timing when the e-mail does not exist. */
let dummyHash: Promise<string> | undefined;
export function dummyVerify(plain: string) {
  dummyHash ??= hashPassword("timing-equaliser-not-a-real-password");
  return dummyHash.then((h) => verifyPassword(h, plain));
}

export function passwordPolicyIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 10) issues.push("Use at least 10 characters.");
  if (pw.length > 128) issues.push("Use at most 128 characters.");
  if (!/[a-zA-Z]/.test(pw) || !/[0-9\W_]/.test(pw)) issues.push("Mix letters with numbers or symbols.");
  return issues;
}
