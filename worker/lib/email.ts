import type { Env } from "../types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const CODE_TTL_MINUTES = 10;

export async function sendLoginCodeEmail(
  email: string,
  code: string,
  env: Env
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const from = env.AUTH_EMAIL_FROM ?? "柳不匆 <no-reply@myelephantgo.xyz>";
  const appName = "柳不匆";
  const subject = `${appName} 登录验证码`;
  const text = `你的 ${appName} 登录验证码是：${code}\n\n验证码 ${CODE_TTL_MINUTES} 分钟内有效。若不是你本人操作，请忽略这封邮件。`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#111827;max-width:480px;margin:0 auto">
      <p>你的 ${appName} 登录验证码是：</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
      <p>验证码 ${CODE_TTL_MINUTES} 分钟内有效。若不是你本人操作，请忽略这封邮件。</p>
    </div>
  `;

  const resp = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      text,
      html
    })
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Resend send failed: ${resp.status} ${detail.slice(0, 300)}`);
  }
}
