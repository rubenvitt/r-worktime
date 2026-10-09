"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  email: z.string().email("Gib eine gültige E-Mail-Adresse ein."),
  password: z.string().min(1, "Gib dein Passwort ein."),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

// Mobil ohne Kartenrahmen, ab sm als ruhige Karte
const CARD_CLASS =
  "gap-5 border-0 bg-transparent py-0 sm:gap-6 sm:border sm:bg-card sm:py-6";
const CARD_SECTION_CLASS = "px-0 sm:px-6";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  async function onSubmit(values: LoginForm) {
    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        setError("E-Mail oder Passwort stimmt nicht.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (_error) {
      setError(
        "Die Anmeldung hat nicht geklappt. Bitte versuch es gleich noch einmal.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className={CARD_CLASS}>
      <CardHeader className={CARD_SECTION_CLASS}>
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Anmelden</h1>
        <CardDescription>
          Melde dich mit deiner E-Mail-Adresse an.
        </CardDescription>
      </CardHeader>
      <CardContent className={CARD_SECTION_CLASS}>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-Mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Passwort</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rememberMe"
              render={({ field }) => (
                <FormItem className="flex min-h-11 flex-row items-center gap-2 space-y-0 sm:min-h-0">
                  <FormControl>
                    <Checkbox
                      name={field.name}
                      checked={field.value ?? false}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true)
                      }
                      onBlur={field.onBlur}
                      ref={field.ref}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">
                    Angemeldet bleiben (30 Tage)
                  </FormLabel>
                </FormItem>
              )}
            />

            {error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="h-11 w-full sm:h-9"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Melde an …
                </>
              ) : (
                "Anmelden"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className={CARD_SECTION_CLASS}>
        <p className="text-sm text-muted-foreground">
          Noch kein Konto?{" "}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Registrieren
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
