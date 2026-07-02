import Link from "next/link";

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#050507] px-6 text-zinc-100">
      <section className="max-w-lg rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">Sakhaa Forge · Auth callback</p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-white">Session check pending</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          The final auth callback will exchange the Supabase session server-side, resolve workspace
          membership and redirect to the current allowed V0 step.
        </p>
        <Link href="/w/demo/create" className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black">
          Continue to workflow preview
        </Link>
      </section>
    </main>
  );
}
