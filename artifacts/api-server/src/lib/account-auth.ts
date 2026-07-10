import type { User } from "@workspace/db";

export function isGoogleOnlyAccount(user: Pick<User, "passwordHash">): boolean {
  return user.passwordHash.startsWith("$google$");
}
