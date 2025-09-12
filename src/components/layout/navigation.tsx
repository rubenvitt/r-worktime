"use client";

import { ChevronDownIcon, MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavigationProps {
  userEmail?: string | null;
  onLogout: () => void;
}

export function Navigation({ userEmail, onLogout }: NavigationProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const isActiveLink = (href: string): boolean => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const linkClasses = (href: string) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActiveLink(href)
        ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
        : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

  return (
    <header className="bg-white dark:bg-gray-800 shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Title */}
          <div className="flex items-center">
            <Link href="/dashboard">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                R-Worktime
              </h1>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {/* Dashboard */}
            <Link href="/dashboard" className={linkClasses("/dashboard")}>
              Dashboard
            </Link>

            {/* Daten Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`inline-flex items-center ${
                    pathname.includes("/entries") ||
                    pathname.includes("/upload") ||
                    pathname.includes("/problems")
                      ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  Daten
                  <ChevronDownIcon className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                  <Link href="/entries" className="w-full">
                    Zeiteinträge
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/upload" className="w-full">
                    Import
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/problems" className="w-full">
                    Probleme
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Berichte Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`inline-flex items-center ${
                    pathname.includes("/overtime") ||
                    pathname.includes("/statistics")
                      ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  Berichte
                  <ChevronDownIcon className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                  <Link href="/overtime" className="w-full">
                    Überstunden
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/statistics" className="w-full">
                    Statistiken
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Einstellungen */}
            <Link href="/settings" className={linkClasses("/settings")}>
              Einstellungen
            </Link>
          </nav>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            {/* Desktop User Info */}
            <div className="hidden md:flex items-center space-x-3">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {userEmail}
              </span>
              <Button variant="outline" size="sm" onClick={onLogout}>
                Abmelden
              </Button>
            </div>

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <XIcon className="h-6 w-6" />
              ) : (
                <MenuIcon className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-gray-700">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {/* Dashboard */}
              <Link
                href="/dashboard"
                className={`block ${linkClasses("/dashboard")}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Dashboard
              </Link>

              {/* Daten Section */}
              <div className="py-2">
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 px-3 py-1 uppercase tracking-wide">
                  Daten
                </div>
                <Link
                  href="/entries"
                  className={`block ml-3 ${linkClasses("/entries")}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Zeiteinträge
                </Link>
                <Link
                  href="/upload"
                  className={`block ml-3 ${linkClasses("/upload")}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Import
                </Link>
                <Link
                  href="/problems"
                  className={`block ml-3 ${linkClasses("/problems")}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Probleme
                </Link>
              </div>

              {/* Berichte Section */}
              <div className="py-2">
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 px-3 py-1 uppercase tracking-wide">
                  Berichte
                </div>
                <Link
                  href="/overtime"
                  className={`block ml-3 ${linkClasses("/overtime")}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Überstunden
                </Link>
                <Link
                  href="/statistics"
                  className={`block ml-3 ${linkClasses("/statistics")}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Statistiken
                </Link>
              </div>

              {/* Einstellungen */}
              <Link
                href="/settings"
                className={`block ${linkClasses("/settings")}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Einstellungen
              </Link>

              {/* Mobile User Section */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <div className="flex items-center justify-between px-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {userEmail}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onLogout();
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    Abmelden
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
