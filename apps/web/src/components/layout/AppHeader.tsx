"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  user: {
    name: string;
    image: string | null;
  };
}

export function AppHeader({ user }: AppHeaderProps) {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <header className="flex items-center justify-between border-b border-game-border px-6 py-3">
      <Link href="/dashboard" className="text-lg font-bold text-white">
        Mathiks
      </Link>
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-lime-accent text-sm font-bold text-black">
            {user.name[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="text-neutral-500 hover:text-neutral-300"
        >
          Sign out
        </Button>
      </div>
    </header>
  );
}
