export default function AppSignupPage() {
  return (
    <main className="min-h-dvh bg-[#121110] px-5 py-6 text-[#F3F2EF]">
      <section className="mx-auto max-w-xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#B4B0A7]">Sakhaa Forge</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Create account</h1>
        <form className="mt-6 space-y-4 rounded-md border border-white/10 bg-white/[0.04] p-4">
          {["Email", "Username", "Password"].map((label) => (
            <label className="block" key={label}>
              <span className="text-xs font-medium text-[#D4D1CA]">{label}</span>
              <input className="mt-2 w-full rounded-md border border-white/10 bg-[#0B0A09] px-3 py-2 text-sm text-white" type={label === "Password" ? "password" : "text"} />
            </label>
          ))}
          <button className="rounded-md bg-[#6557F5] px-4 py-2 text-sm font-semibold text-white">Continue</button>
        </form>
      </section>
    </main>
  );
}
