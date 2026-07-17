import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../stores/auth";
import { useToastStore } from "../stores/toast";

type Step = "email" | "code";

export function Login() {
  const requestCode = useAuthStore((s) => s.requestCode);
  const verifyCode = useAuthStore((s) => s.verifyCode);
  const loading = useAuthStore((s) => s.loading);
  const showToast = useToastStore((s) => s.show);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // 自动聚焦
  useEffect(() => {
    if (step === "email") emailRef.current?.focus();
    else codeRef.current?.focus();
  }, [step]);

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleSendCode = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("请输入邮箱");
      emailRef.current?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("邮箱格式不正确");
      return;
    }
    const result = await requestCode(trimmed);
    if (result.ok) {
      setStep("code");
      setCountdown(60);
      showToast("验证码已发送，10 分钟内有效");
      setTimeout(() => codeRef.current?.focus(), 50);
    } else {
      setError(result.error ?? "发送失败，请稍后重试");
    }
  };

  const handleVerify = async () => {
    setError(null);
    const trimmedCode = code.trim();
    if (!email.trim() || !trimmedCode) {
      setError("请输入邮箱和验证码");
      return;
    }
    if (!/^\d{6}$/.test(trimmedCode)) {
      setError("验证码是 6 位数字");
      return;
    }
    const result = await verifyCode(email.trim(), trimmedCode);
    if (!result.ok) {
      setError(result.error ?? "验证失败，请检查验证码");
    }
  };

  const handleBackToEmail = () => {
    setStep("email");
    setCode("");
    setError(null);
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      e.preventDefault();
      void handleSendCode();
    }
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      e.preventDefault();
      void handleVerify();
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <BrandMark />
          <h1 className="login-title">柳不匆</h1>
          <p className="login-sub">
            低负担地记录时间实际上花在了哪里。
            <br />
            真实活动是核心，计划只是可选参照。
          </p>
        </div>

        {step === "email" ? (
          <>
            <div className="login-field">
              <label htmlFor="email">邮箱登录</label>
              <input
                ref={emailRef}
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleEmailKeyDown}
                disabled={loading}
              />
            </div>
            <button
              className="btn btn-primary login-submit"
              onClick={handleSendCode}
              disabled={loading}
              type="button"
            >
              {loading ? "发送中…" : "发送验证码"}
            </button>
          </>
        ) : (
          <>
            <div className="login-field">
              <label htmlFor="code">
                验证码 <span className="login-step-hint">已发送至 {email.trim()}</span>
              </label>
              <input
                ref={codeRef}
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6 位数字"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={handleCodeKeyDown}
                disabled={loading}
                className="login-code-input"
              />
            </div>
            <button
              className="btn btn-primary login-submit"
              onClick={handleVerify}
              disabled={loading || code.length !== 6}
              type="button"
            >
              {loading ? "验证中…" : "登录"}
            </button>
            <div className="login-actions">
              <button
                className="text-link"
                onClick={handleBackToEmail}
                disabled={loading}
                type="button"
              >
                ← 换个邮箱
              </button>
              <button
                className="text-link"
                onClick={handleSendCode}
                disabled={loading || countdown > 0}
                type="button"
              >
                {countdown > 0 ? `${countdown}s 后可重发` : "重新发送"}
              </button>
            </div>
          </>
        )}

        {error && <div className="login-error">{error}</div>}

        <p className="login-hint">
          支持任意有效邮箱登录。收不到验证码？请检查垃圾箱后重新发送。
        </p>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 48 48" className="login-brand-mark" aria-hidden="true">
      <defs>
        <linearGradient id="loginGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(84% 0.09 300)" />
          <stop offset="0.5" stopColor="oklch(87% 0.095 145)" />
          <stop offset="1" stopColor="oklch(88% 0.105 72)" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#loginGrad)" />
      <g
        stroke="oklch(25% 0.025 270)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        transform="rotate(-4 24 24)"
      >
        <path d="M24 42c0-14 2-24 12-34" />
        <path d="M28 29c7 0 11-4 12-10-7-1-12 2-12 10Z" />
        <path d="M22 35c-7 0-11-4-12-10 7-1 12 2 12 10Z" />
        <path d="M31 20c-5-1-8-4-8-9 6 0 9 3 8 9Z" />
      </g>
    </svg>
  );
}
