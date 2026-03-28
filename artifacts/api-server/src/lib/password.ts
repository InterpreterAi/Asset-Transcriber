import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedBuf = Buffer.from(hashed, "hex");
  return buf.length === storedBuf.length && timingSafeEqual(buf, storedBuf);
}
