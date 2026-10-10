"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const registerSchema = z
  .object({
    name: z.string().min(2, "Der Name braucht mindestens 2 Zeichen."),
    email: z.string().email("Gib eine gültige E-Mail-Adresse ein."),
    password: z
      .string()
      .min(8, "Das Passwort braucht mindestens 8 Zeichen.")
      .regex(/[A-Z]/, "Das Passwort braucht mindestens einen Großbuchstaben.")
      .regex(/[a-z]/, "Das Passwort braucht mindestens einen Kleinbuchstaben.")
      .regex(/[0-9]/, "Das Passwort braucht mindestens eine Zahl."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Die Passwörter stimmen nicht überein.",
    path: ["confirmPassword"],
  });

type RegisterValues = z.infer<typeof registerSchema>;

// Mobil ohne Kartenrahmen, ab sm als ruhige Karte
const CARD_CLASS =
  "gap-5 border-0 bg-transparent py-0 sm:gap-6 sm:border sm:bg-card sm:py-6";
const CARD_SECTION_CLASS = "px-0 sm:px-6";

export function RegisterForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: RegisterValues) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Klartext der API, z. B. beim Rate-Limit
        setError(data.error || "Das Konto konnte nicht angelegt werden.");
      } else {
        router.push("/login?registered=true");
      }
    } catch (_error) {
      setError(
        "Das Konto konnte nicht angelegt werden. Bitte versuch es gleich noch einmal.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className={CARD_CLASS}>
      <CardHeader className={CARD_SECTION_CLASS}>
        <h1 className="text-xl font-semibold tracking-[-0.01em]">
          Konto anlegen
        </h1>
        <CardDescription>Leg dein Konto an.</CardDescription>
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="name"
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
                      autoComplete="new-password"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Mindestens 8 Zeichen, mit Groß- und Kleinbuchstaben und
                    einer Zahl.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Passwort wiederholen</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
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
                  Lege an …
                </>
              ) : (
                "Konto anlegen"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className={CARD_SECTION_CLASS}>
        <p className="text-sm text-muted-foreground">
          Schon ein Konto?{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Anmelden
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
