"use client";

import { Keyboard, LogOut, MoreHorizontal } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useShortcutsDialog } from "@/components/layout/shortcuts-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Benutzerzeile: E-Mail und Menü für Darstellung, Tastenkürzel, Abmelden. */
export function UserMenu({ userEmail }: { userEmail?: string | null }) {
  const { theme, setTheme } = useTheme();
  const { openShortcuts } = useShortcutsDialog();

  return (
    <div className="flex items-center gap-1 pl-2">
      <span
        className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
        title={userEmail ?? undefined}
      >
        {userEmail ?? "Angemeldet"}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 hover:bg-sidebar-accent md:size-8"
            aria-label="Konto und Darstellung"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Darstellung
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme ?? "system"}
            onValueChange={(value) => setTheme(value)}
          >
            <DropdownMenuRadioItem value="light">Hell</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dunkel</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openShortcuts()}>
            <Keyboard />
            Tastenkürzel
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              signOut({ callbackUrl: "/login" });
            }}
          >
            <LogOut />
            Abmelden
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
