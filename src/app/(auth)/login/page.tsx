import { LoginForm } from "@/components/auth/login-form";
import { isRegistrationEnabled } from "@/lib/registration";

// Zur Laufzeit lesen, nicht beim Build: das Docker-Image kennt die Env erst beim Start.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm registrationEnabled={isRegistrationEnabled()} />;
}
