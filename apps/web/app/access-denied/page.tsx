import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#050507] px-6 text-zinc-100">
      <section className="max-w-lg rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">Sakhaa Forge · Access denied</p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-white">Workspace access is not available</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          We could not confirm your membership for this workspace. Protected resources use the same
          response for missing and unavailable cross-workspace references.
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black">
          Return to landing page
        </Link>
      </section>
    </main>
  );
}
