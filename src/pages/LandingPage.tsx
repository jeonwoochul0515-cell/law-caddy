import { Link } from "react-router-dom";
import { Mic, Brain, FileText, Check, ArrowRight, Scale } from "lucide-react";

const FEATURES = [
  {
    icon: <Mic className="w-8 h-8 text-gold" />,
    emoji: "\uD83C\uDFA4",
    title: "\uC74C\uC131 \uC778\uC2DD",
    description: "RTZR STT\uB85C \uBCC0\uD638\uC0AC-\uC758\uB8B0\uC778 \uB300\uD654\uB97C \uC790\uB3D9 \uBCC0\uD658",
  },
  {
    icon: <Brain className="w-8 h-8 text-gold" />,
    emoji: "\uD83E\uDDE0",
    title: "AI \uBD84\uC11D",
    description: "6\uAC1C \uBCD1\uB82C \uC5D0\uC774\uC804\uD2B8\uAC00 \uD310\uB840\xB7\uC801\uBC95\uC131\xB7\uC7C1\uC810\uC744 \uC989\uC2DC \uBD84\uC11D",
  },
  {
    icon: <FileText className="w-8 h-8 text-gold" />,
    emoji: "\uD83D\uDCC4",
    title: "\uBB38\uC11C \uC0DD\uC131",
    description: "\uB0B4\uC6A9\uC99D\uBA85, \uC18C\uC7A5, \uB2F5\uBCC0\uC11C \uB4F1 \uBC95\uB960 \uBB38\uC11C \uC790\uB3D9 \uC791\uC131",
  },
] as const;

const PLANS = [
  {
    name: "Starter",
    price: "\u20A949,000",
    period: "/\uC6D4",
    features: [
      "5\uAC74 \uB179\uC74C/\uC6D4",
      "3\uAC74 \uBB38\uC11C/\uC6D4",
      "\uAE30\uBCF8 AI \uBD84\uC11D",
      "\uC774\uBA54\uC77C \uC9C0\uC6D0",
    ],
    highlighted: false,
  },
  {
    name: "Pro",
    price: "\u20A989,000",
    period: "/\uC6D4",
    features: [
      "\uBB34\uC81C\uD55C \uB179\uC74C",
      "6\uAC1C \uC5D0\uC774\uC804\uD2B8 \uC804\uCCB4",
      "\uBB34\uC81C\uD55C \uBB38\uC11C \uC0DD\uC131",
      "\uC758\uB8B0\uC778 \uBA54\uC2DC\uC9C0 \uC790\uB3D9 \uC0DD\uC131",
      "\uCF00\uC774\uC2A4 \uAD00\uB9AC",
      "\uC6B0\uC120 \uC9C0\uC6D0",
    ],
    highlighted: true,
  },
  {
    name: "Team",
    price: "\u20A969,000",
    period: "/\uC778",
    features: [
      "Pro \uC804\uCCB4 \uAE30\uB2A5",
      "\uD300 \uACF5\uC720 \uB300\uC2DC\uBCF4\uB4DC",
      "\uAD00\uB9AC\uC790 \uAE30\uB2A5",
      "3\uC778 \uC774\uC0C1",
      "\uC804\uB2F4 \uB9E4\uB2C8\uC800",
    ],
    highlighted: false,
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-navy">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-navy/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-6 h-6 text-gold" />
            <span className="text-xl font-bold bg-gradient-to-r from-gold to-gold-bright bg-clip-text text-transparent">
              LAW-CADDY
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm text-text-dim hover:text-text-primary transition-colors"
            >
              {"\uB85C\uADF8\uC778"}
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold hover:opacity-90 transition-opacity"
            >
              {"\uD68C\uC6D0\uAC00\uC785"}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gold/5 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-gold/3 rounded-full blur-2xl" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-dim border border-gold/20 mb-8">
            <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
            <span className="text-sm text-gold">{"\uBCC0\uD638\uC0AC \uC804\uC6A9 AI \uC5B4\uC2DC\uC2A4\uD134\uD2B8"}</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6">
            <span className="bg-gradient-to-r from-gold via-gold-bright to-gold bg-clip-text text-transparent">
              LAW-CADDY
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-text-primary font-medium mb-4">
            {"\uBCC0\uD638\uC0AC AI \uC0C1\uB2F4 \uC5B4\uC2DC\uC2A4\uD134\uD2B8"}
          </p>

          <p className="text-lg text-text-dim max-w-2xl mx-auto mb-10 leading-relaxed">
            {"\uC0C1\uB2F4 \uB179\uC74C \u2192 AI \uBD84\uC11D \u2192 \uBC95\uB960 \uBB38\uC11C \uC790\uB3D9 \uC0DD\uC131"}
            <br />
            {"\uBCC0\uD638\uC0AC\uC758 \uC5C5\uBB34 \uD6A8\uC728\uC744 \uD601\uC2E0\uC801\uC73C\uB85C \uB192\uC5EC\uB4DC\uB9BD\uB2C8\uB2E4."}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-gold to-gold-bright text-navy font-bold text-lg hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg shadow-gold/20"
            >
              {"\uC2DC\uC791\uD558\uAE30"}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              to="/login?demo=true"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-border hover:border-border-hover text-text-primary hover:text-gold transition-all"
            >
              {"\uB370\uBAA8 \uCCB4\uD5D8"}
            </Link>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            {[
              { step: "1", label: "\uB179\uC74C/\uC5C5\uB85C\uB4DC" },
              { step: "2", label: "RTZR STT \uBCC0\uD658" },
              { step: "3", label: "6\uAC1C \uC5D0\uC774\uC804\uD2B8 \uBD84\uC11D" },
              { step: "4", label: "\uCCB4\uD06C\uD3EC\uC778\uD2B8 \uD655\uC778" },
              { step: "5", label: "\uBB38\uC11C \uC0DD\uC131" },
            ].map((item, i) => (
              <div key={item.step} className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border">
                  <span className="w-6 h-6 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">
                    {item.step}
                  </span>
                  <span className="text-text-primary whitespace-nowrap">{item.label}</span>
                </div>
                {i < 4 && (
                  <ArrowRight className="w-4 h-4 text-text-dim hidden sm:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              {"\uD575\uC2EC \uAE30\uB2A5"}
            </h2>
            <p className="text-text-dim text-lg">
              {"\uC0C1\uB2F4\uBD80\uD130 \uBB38\uC11C \uC0DD\uC131\uAE4C\uC9C0, AI\uAC00 \uBCC0\uD638\uC0AC\uC758 \uC5C5\uBB34\uB97C \uC9C0\uC6D0\uD569\uB2C8\uB2E4."}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group p-8 rounded-2xl bg-surface border border-border hover:border-gold/20 transition-all hover:bg-surface-hover"
              >
                <div className="w-14 h-14 rounded-xl bg-gold-dim flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3">
                  {feature.emoji} {feature.title}
                </h3>
                <p className="text-text-dim leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agents Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              {"6\uAC1C AI \uC5D0\uC774\uC804\uD2B8\uAC00 \uBCD1\uB82C\uB85C \uBD84\uC11D"}
            </h2>
            <p className="text-text-dim text-lg">
              {"\uB179\uC74C\uC774 \uC644\uB8CC\uB418\uBA74, 6\uAC1C\uC758 \uC804\uBB38 AI\uAC00 \uB3D9\uC2DC\uC5D0 \uC791\uC5C5\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4."}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { emoji: "\uD83D\uDCDA", name: "\uD310\uB840 \uAC80\uC0C9", desc: "\uC720\uC0AC \uD310\uB840 3~5\uAC74 \uAC80\uC0C9 \uBC0F \uC2DC\uC0AC\uC810 \uBD84\uC11D" },
              { emoji: "\u2696\uFE0F", name: "\uC801\uBC95\uC131 \uAC80\uC99D", desc: "\uD1B5\uBE44\uBC95\xB7\uBCC0\uD638\uC0AC\uBC95\xB7\uAC1C\uBCF4\uBC95 \uC900\uC218 \uD655\uC778" },
              { emoji: "\uD83C\uDFA4", name: "\uC74C\uC131 \uBCC0\uD658", desc: "RTZR STT + \uD654\uC790 \uAD6C\uBD84 \uB300\uD654\uB85D \uC0DD\uC131" },
              { emoji: "\uD83E\uDDE0", name: "\uC7C1\uC810 \uBD84\uC11D", desc: "\uD575\uC2EC \uC7C1\uC810 3\uAC00\uC9C0 + \uBC95\uC870\uBB38 \uB9E4\uCE6D" },
              { emoji: "\uD83D\uDCC4", name: "\uBB38\uC11C \uC791\uC131", desc: "\uCCB4\uD06C\uD3EC\uC778\uD2B8 \uD655\uC778 \u2192 \uBC95\uB960 \uBB38\uC11C \uCD08\uC548" },
              { emoji: "\u2705", name: "검토\xB7감수", desc: "5점 척도 평가 + 수정 제안 5가지" },
            ].map((agent) => (
              <div
                key={agent.name}
                className="flex items-start gap-4 p-5 rounded-xl bg-surface border border-border hover:border-gold/20 transition-colors"
              >
                <span className="text-2xl">{agent.emoji}</span>
                <div>
                  <h4 className="font-semibold text-text-primary mb-1">{agent.name}</h4>
                  <p className="text-sm text-text-dim">{agent.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              {"\uC694\uAE08\uC81C"}
            </h2>
            <p className="text-text-dim text-lg">
              {"\uC0AC\uBB34\uC18C \uADDC\uBAA8\uC5D0 \uB9DE\uB294 \uD50C\uB79C\uC744 \uC120\uD0DD\uD558\uC138\uC694."}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative p-8 rounded-2xl border transition-all ${
                  plan.highlighted
                    ? "bg-gold-dim border-gold/30 scale-[1.02] shadow-xl shadow-gold/10"
                    : "bg-surface border-border hover:border-border-hover"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-gold to-gold-bright text-navy text-xs font-bold">
                    {"\uCD94\uCC9C"}
                  </div>
                )}

                <h3
                  className={`text-xl font-bold mb-2 ${
                    plan.highlighted ? "text-gold" : "text-text-primary"
                  }`}
                >
                  {plan.name}
                </h3>

                <div className="flex items-baseline gap-1 mb-6">
                  <span
                    className={`text-4xl font-bold ${
                      plan.highlighted ? "text-gold-bright" : "text-text-primary"
                    }`}
                  >
                    {plan.price}
                  </span>
                  <span className="text-text-dim text-sm">{plan.period}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm">
                      <Check
                        className={`w-4 h-4 flex-shrink-0 ${
                          plan.highlighted ? "text-gold" : "text-success"
                        }`}
                      />
                      <span className="text-text-primary">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/register"
                  className={`block w-full text-center py-3 rounded-xl font-semibold transition-all ${
                    plan.highlighted
                      ? "bg-gradient-to-r from-gold to-gold-bright text-navy hover:opacity-90"
                      : "border border-border hover:border-gold/30 text-text-primary hover:text-gold"
                  }`}
                >
                  {"\uC2DC\uC791\uD558\uAE30"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
            {"\uC9C0\uAE08 \uBC14\uB85C \uC2DC\uC791\uD558\uC138\uC694"}
          </h2>
          <p className="text-text-dim text-lg mb-8">
            {"AI\uAC00 \uBD84\uC11D\uD558\uACE0, \uBCC0\uD638\uC0AC\uAC00 \uACB0\uC815\uD569\uB2C8\uB2E4."}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-gold to-gold-bright text-navy font-bold text-lg hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg shadow-gold/20"
            >
              {"\uBB34\uB8CC\uB85C \uC2DC\uC791\uD558\uAE30"}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-gold/60" />
            <span className="text-sm text-text-dim">
              &copy; 2024 LAW-CADDY. AI가 분석하고, 변호사가 결정합니다.
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-text-dim">
            <Link to="/login" className="hover:text-text-primary transition-colors">
              {"\uB85C\uADF8\uC778"}
            </Link>
            <Link to="/register" className="hover:text-text-primary transition-colors">
              {"\uD68C\uC6D0\uAC00\uC785"}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
