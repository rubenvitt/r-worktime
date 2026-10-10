import { notFound } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";
import { isRegistrationEnabled } from "@/lib/registration";

// Zur Laufzeit lesen, nicht beim Build: das Docker-Image kennt die Env erst beim Start.
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  if (!isRegistrationEnabled()) notFound();
  return <RegisterForm />;
}
