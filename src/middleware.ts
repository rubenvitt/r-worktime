import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");
  const isPublicPage = req.nextUrl.pathname === "/";
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");

  // API Routes handhaben
  if (isApiRoute) {
    return NextResponse.next();
  }

  // Wenn nicht eingeloggt und versucht geschützte Seite zu besuchen
  if (!isLoggedIn && !isAuthPage && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Wenn eingeloggt und versucht Auth-Seite zu besuchen
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
