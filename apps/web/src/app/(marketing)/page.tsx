import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-landing-bg">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10 lg:px-16">
        <span className="text-xl font-bold tracking-tight text-white">
          Mathiks
        </span>
        <div className="flex items-center gap-8">
          <Link
            href="/login"
            className="hidden text-sm text-neutral-400 transition-colors hover:text-white sm:block"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full border border-neutral-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:border-neutral-400"
          >
            Play Now
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="grid-bg flex min-h-[calc(100dvh-72px)] items-center px-6 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-8 lg:flex-row lg:gap-0">
          {/* Left — Mascot + Phone image */}
          <div className="relative flex flex-shrink-0 items-end justify-center lg:w-[45%]">
            <img
              src="/hero-mascot.webp"
              alt="Mathiks game preview"
              className="h-auto w-full max-w-[480px] object-contain"
            />
          </div>

          {/* Right — Headline + CTA */}
          <div className="flex flex-col items-center text-center lg:w-[55%] lg:items-start lg:pl-4 lg:text-left">
            <h1
              className="text-6xl leading-[0.95] font-bold uppercase italic tracking-tight text-white sm:text-7xl md:text-8xl lg:text-[7rem]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Turn screen
              <br />
              time into
              <br />
              <span className="text-lime-accent">smart time</span>
            </h1>
            <p className="mt-6 text-base text-neutral-400 sm:text-lg">
              Fast mental duels against real players.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-block border border-lime-accent px-12 py-3.5 text-sm font-semibold uppercase tracking-[0.2em] text-white transition-colors hover:bg-lime-accent/10"
            >
              Play Now
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
