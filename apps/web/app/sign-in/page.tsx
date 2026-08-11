"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Building2, Key, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@sakhaatribe.com");
  const [password, setPassword] = useState("forge2026");
  const [isLoading, setIsLoading] = useState(false);
  const [workspace, setWorkspace] = useState("india_realestate_v0");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Save dummy workspace session for local workflow tracking
    try {
      localStorage.setItem("v0_demo_session", JSON.stringify({
        email,
        workspaceId: workspace,
        token: "demo-jwt-token-v0",
        signedInAt: new Date().toISOString(),
      }));
    } catch {
      // Ignore local storage errors if restricted
    }

    setTimeout(() => {
      router.push("/brand-extract");
    }, 400);
  };

  const applyPreset = (presetEmail: string, presetWorkspace: string) => {
    setEmail(presetEmail);
    setWorkspace(presetWorkspace);
    setPassword("forge2026");
  };

  return (
    <main className="min-h-dvh bg-[#050507] text-zinc-100 flex flex-col justify-between p-6 relative overflow-hidden select-none font-sans">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header bar */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between z-10 py-2">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-7 w-7 rounded bg-zinc-900 border border-white/15 flex items-center justify-center group-hover:border-amber-400/50 transition-colors">
            <span className="h-3 w-3 border border-amber-400 transform rotate-45" />
          </div>
          <span className="font-display font-bold text-sm tracking-wider uppercase text-white">
            Sakhaa Forge <span className="text-[9px] font-mono text-amber-400 border border-amber-400/30 px-1 py-0.2 rounded bg-amber-400/10 ml-1">V0</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>Tenant Isolated Environment</span>
        </div>
      </header>

      {/* Main Login Card */}
      <section className="w-full max-w-md mx-auto my-auto z-10 py-8">
        <div className="bg-zinc-950/80 border border-white/15 rounded-3xl p-7 md:p-8 backdrop-blur-2xl shadow-2xl space-y-6 relative overflow-hidden">
          {/* Subtle card top gradient */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

          {/* Heading */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-[9px] font-mono tracking-widest uppercase rounded-full border border-amber-400/30 text-amber-400 bg-amber-400/10">
                Step 0 · Access Workspace
              </span>
            </div>
            <h1 className="text-2xl font-display font-semibold text-white tracking-tight">
              Sign in to Sakhaa Forge
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed font-sans">
              Enter your credentials to launch the brand intake workflow. Pre-filled with standard test workspace details.
            </p>
          </div>

          {/* Persona Presets */}
          <div className="space-y-2 pt-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Quick Test Personas</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => applyPreset("demo@sakhaatribe.com", "india_realestate_v0")}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  email === "demo@sakhaatribe.com"
                    ? "border-amber-400/60 bg-amber-400/10 text-white"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-amber-300">
                  <Building2 className="h-3 w-3" /> Real Estate
                </div>
                <div className="text-[11px] font-medium text-white truncate mt-0.5">Surya Valencia</div>
              </button>

              <button
                type="button"
                onClick={() => applyPreset("operator@sakhaatribe.com", "agency_internal_v0")}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  email === "operator@sakhaatribe.com"
                    ? "border-amber-400/60 bg-amber-400/10 text-white"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-purple-300">
                  <Key className="h-3 w-3" /> Operator
                </div>
                <div className="text-[11px] font-medium text-white truncate mt-0.5">Agency Operator</div>
              </button>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>Work Email</span>
                <span className="text-zinc-500 font-sans normal-case">dummy enabled</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-900/90 border border-white/15 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/60 transition-all font-mono"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>Password</span>
                <span className="text-amber-400 text-[10px]">forge2026</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-900/90 border border-white/15 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/60 transition-all font-mono"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            {/* Workspace indicator */}
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 bg-white/5 p-2.5 rounded-xl border border-white/10">
              <span className="text-zinc-500 uppercase">Target Workspace:</span>
              <span className="text-amber-300 font-semibold">{workspace}</span>
            </div>

            {/* Submit CTA */}
            <button
              type="submit"
              disabled={isLoading}
              className="primary-action w-full mt-2 py-3 px-5 text-xs font-mono uppercase tracking-widest text-black font-semibold rounded-xl bg-amber-400 hover:bg-amber-300 transition-all duration-300 shadow-lg shadow-amber-400/20 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                  <span>Authenticating Workspace...</span>
                </>
              ) : (
                <>
                  <span>Sign In & Begin Brand Intake</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="flex items-center justify-between border-t border-white/10 pt-4 text-[10px] text-zinc-500 font-mono">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-400" /> First Step: Brand Extract
            </span>
            <Link href="/brand-extract" className="text-zinc-400 hover:text-white underline">
              Skip to studio →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-5xl mx-auto flex items-center justify-between text-[10px] font-mono text-zinc-600 z-10">
        <span>Sakhaa Forge V0 · India-First Creative Engine</span>
        <span>Standalone Mode (V1/V2 absent)</span>
      </footer>
    </main>
  );
}
