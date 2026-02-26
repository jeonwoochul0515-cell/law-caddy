import { useState } from "react";
import { Link } from "react-router-dom";

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  error?: string;
}

export default function LoginForm({ onSubmit, error }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(email, password);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gold mb-2">LAW-CADDY</h1>
          <p className="text-text-dim">변호사 AI 상담 어시스턴트</p>
        </div>

        {/* 로그인 폼 */}
        <div className="bg-surface border border-border rounded-2xl p-8 backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-text-primary mb-6">로그인</h2>

          {error && (
            <div className="bg-error/10 border border-error/30 rounded-lg p-3 mb-4 text-error text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-text-dim mb-1.5">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
                placeholder="email@lawfirm.com"
              />
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
                placeholder="••••••••"
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
                  로그인 중...
                </span>
              ) : (
                "로그인"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-dim">
            계정이 없으신가요?{" "}
            <Link to="/register" className="text-gold hover:text-gold-bright transition-colors">
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
