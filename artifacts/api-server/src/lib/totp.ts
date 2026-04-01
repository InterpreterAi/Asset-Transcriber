import speakeasy from "speakeasy";
import QRCode from "qrcode";

const APP_NAME = "InterpreterAI";

export function generateTotpSecret(email: string): { secret: string; otpauthUrl: string } {
  const result = speakeasy.generateSecret({
    name:   `${APP_NAME} (${email})`,
    issuer: APP_NAME,
    length: 20,
  });
  return {
    secret:     result.base32,
    otpauthUrl: result.otpauth_url ?? "",
  };
}

export async function generateQrDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

export function verifyTotp(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token:    token.replace(/\s/g, ""),
    window:   1,
  });
}
