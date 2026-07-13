import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="min-h-dvh bg-[#050507] px-6 py-10 text-zinc-100">
      <section className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-xl flex-col justify-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">Sakhaa Forge</p>
        <h1 className="mt-4 font-display text-4xl font-semibold text-white">Sign in to your workspace</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-300">
          Authentication is handled by the V0 control plane. This screen stays quiet until the
          Supabase sign-in wiring is connected.
        </p>
        <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">Current state</p>
          <p className="mt-2 text-sm text-zinc-200">No session has been resolved in this browser.</p>
        </div>
        <Link
          href="/w/demo/create"
          className="primary-action mt-6 inline-flex w-fit rounded-full bg-white px-5 py-3 text-sm font-semibold text-black hover:-translate-y-0.5 hover:bg-zinc-200"
        >
          Open local workflow preview
        </Link>
      </section>
    </main>
  );
}
