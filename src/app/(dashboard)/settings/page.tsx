import { Bell, Clock, Shield, User } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SettingsPage() {
  const settingsCategories = [
    {
      title: "Überstunden-Einstellungen",
      description: "Anfangs-Saldo und Berechnungsregeln",
      icon: Clock,
      href: "/settings/overtime",
    },
    {
      title: "Profil",
      description: "Name, E-Mail und persönliche Daten",
      icon: User,
      href: "/settings/profile",
    },
    {
      title: "Benachrichtigungen",
      description: "E-Mail und Push-Benachrichtigungen",
      icon: Bell,
      href: "/settings/notifications",
    },
    {
      title: "Sicherheit",
      description: "Passwort und Zwei-Faktor-Authentifizierung",
      icon: Shield,
      href: "/settings/security",
    },
  ];

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Einstellungen
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Verwalte deine Kontoeinstellungen und Präferenzen
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {settingsCategories.map((category) => {
          const Icon = category.icon;
          return (
            <Link key={category.href} href={category.href}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center space-x-4 pb-2">
                  <Icon className="h-8 w-8 text-primary" />
                  <div>
                    <CardTitle className="text-lg">{category.title}</CardTitle>
                    <CardDescription>{category.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
