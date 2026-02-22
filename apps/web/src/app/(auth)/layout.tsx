import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid-bg flex min-h-dvh flex-col bg-landing-bg">
      <nav className="flex items-center px-6 py-5 sm:px-10">
        <Link href="/" className="text-xl font-bold tracking-tight text-white">
          Mathiks
        </Link>
      </nav>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}
