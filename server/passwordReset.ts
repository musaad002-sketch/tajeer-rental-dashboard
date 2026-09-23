import { createHash } from "node:crypto";

const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_KEY = 5;
const requestBuckets = new Map<string, number[]>();

export const PASSWORD_RESET_MESSAGE =
  "إذا كان البريد الإلكتروني مرتبطاً بحساب موثق، فسيصلك رابط استعادة صالح لمدة محدودة.";

export function normalizePasswordResetEmail(email: string) {
  return email.trim().toLowerCase();
}

export function consumePasswordResetRateLimit(keys: string[], now = Date.now()) {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  const activeBuckets = uniqueKeys.map(key => {
    const recent = (requestBuckets.get(key) ?? []).filter(
      timestamp => now - timestamp < REQUEST_WINDOW_MS
    );
    requestBuckets.set(key, recent);
    return recent;
  });
  if (activeBuckets.some(bucket => bucket.length >= MAX_REQUESTS_PER_KEY))
    return false;
  activeBuckets.forEach(bucket => bucket.push(now));
  return true;
}

export function hashPasswordResetRateLimitEmail(email: string) {
  return createHash("sha256")
    .update(normalizePasswordResetEmail(email))
    .digest("hex");
}

export function buildPasswordResetUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Password reset email provider is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "استعادة كلمة المرور — مكتب مشاري لتأجير السيارات",
      text: `لإنشاء كلمة مرور جديدة، افتح الرابط التالي خلال ساعة:\n\n${input.resetUrl}\n\nإذا لم تطلب ذلك، فتجاهل هذه الرسالة.`,
    }),
  });
  if (!response.ok) throw new Error("Password reset email delivery failed");
}

export function clearPasswordResetRateLimitForTests() {
  requestBuckets.clear();
}

export const passwordResetLimits = {
  windowMs: REQUEST_WINDOW_MS,
  maxRequestsPerKey: MAX_REQUESTS_PER_KEY,
};
