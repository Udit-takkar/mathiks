import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { AppHeader } from "@/components/layout/AppHeader";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-dvh bg-game-bg">
      <AppHeader user={session.user} />
      {children}
    </div>
  );
}
