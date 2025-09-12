"use client";

import { signOut } from "next-auth/react";
import { Navigation } from "./navigation";

interface NavigationWrapperProps {
  userEmail?: string | null;
}

export function NavigationWrapper({ userEmail }: NavigationWrapperProps) {
  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  return <Navigation userEmail={userEmail} onLogout={handleLogout} />;
}
