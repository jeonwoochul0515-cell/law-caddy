import { useState } from "react";
import { Link } from "react-router-dom";

interface RegisterFormProps {
  onSubmit: (data: {
    email: string;
    password: string;
    name: string;
    firmName: string;
    barLicenseNumber: string;
  }) => Promise<void>;
  error?: string;
}

export default function RegisterForm({ onSubmit, error }: RegisterFormProps) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    firmName: "",
    barLicenseNumber: "",
  });
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (form.password !== form.passwordConfirm) {
      setLocalError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (form.password.length < 6) {
      setLocalError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        email: form.email,
        password: form.password,
        name: form.name,
        firmName: form.firmName,
        barLicenseNumber: form.barLicenseNumber,
      });
    } finally {
      setLoading(false);
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gold mb-2">LAW-CADDY</h1>
          <p className="text-text-dim">변호사 회원가입</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-8 backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-text-primary mb-6">회원가입</h2>

          {displayError && (
            <div className="bg-error/10 border border-error/30 rounded-lg p-3 mb-4 text-error text-sm">
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-text-dim mb-1.5">변호사 이름</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
                placeholder="홍길동"
              />
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">법률사무소 이름</label>
              <input
                name="firmName"
                value={form.firmName}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
                placeholder="법무법인 OO"
              />
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">변호사 등록번호</label>
              <input
                name="barLicenseNumber"
                value={form.barLicenseNumber}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
                placeholder="12345"
              />
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">이메일</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
                placeholder="email@lawfirm.com"
              />
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">비밀번호</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
                placeholder="6자 이상"
              />
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">비밀번호 확인</label>
              <input
                type="password"
                name="passwordConfirm"
                value={form.passwordConfirm}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
                placeholder="비밀번호 재입력"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />
                  가입 처리 중...
                </span>
              ) : (
                "회원가입"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-dim">
            이미 계정이 있으신가요?{" "}
            <Link to="/login" className="text-gold hover:text-gold-bright transition-colors">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
