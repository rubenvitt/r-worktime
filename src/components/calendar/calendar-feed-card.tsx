"use client";

import {
  CircleAlert,
  CircleCheck,
  Link2,
  Loader2,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CalendarFeedTest, CalendarSettings } from "./api-types";
import { formatFeedTest, maskedFeedUrl } from "./calendar-format";
import { useSaveCalendarSettings } from "./use-calendar";

export const FEED_INPUT_ID = "calendar-feed-url";

/** Ergebnis des Testabrufs nach dem Speichern */
export function FeedTestResult({ test }: { test: CalendarFeedTest }) {
  const hasUnknown = test.unknownTypes.length > 0;
  return (
    <Alert variant={hasUnknown ? "warning" : "info"} role="status">
      {hasUnknown ? <TriangleAlert /> : <CircleCheck />}
      <AlertTitle>Feed gelesen</AlertTitle>
      <AlertDescription>
        <p className="num">{formatFeedTest(test)}</p>
        {hasUnknown ? (
          <p className="mt-1 break-words text-[13px] text-muted-foreground">
            Unbekannte Typen werden übersprungen: {test.unknownTypes.join(", ")}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function CalendarFeedCard({ settings }: { settings: CalendarSettings }) {
  const save = useSaveCalendarSettings();
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(!settings.configured);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastTest, setLastTest] = useState<CalendarFeedTest | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const trimmed = url.trim();
  const showInput = editing || !settings.configured;

  const handleSave = () => {
    setSaveError(null);
    save.mutate(
      { feedUrl: trimmed },
      {
        onSuccess: ({ test }) => {
          setUrl("");
          setEditing(false);
          setLastTest(test ?? null);
          toast.success("Feed gespeichert", {
            description: test ? formatFeedTest(test) : undefined,
          });
        },
        onError: (error) => {
          setSaveError(error.message);
          toast.error(error.message);
        },
      },
    );
  };

  const handleRemove = () => {
    save.mutate(
      { feedUrl: null },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setEditing(true);
          setLastTest(null);
          toast.success("Feed entfernt");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <Panel aria-labelledby="calendar-feed-title">
      <PanelHeader
        title={<span id="calendar-feed-title">Timewarp-Feed</span>}
        actions={
          settings.configured ? (
            <StatusBadge tone="neutral" icon={Link2}>
              Feed hinterlegt
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Kein Feed</StatusBadge>
          )
        }
      />
      <PanelBody className="space-y-4">
        <p className="max-w-prose text-[13px] text-muted-foreground">
          r-worktime liest deine Abwesenheiten aus dem Kalender-Feed von
          Timewarp. Die geheime Adresse findest du in Timewarp beim
          Kalender-Export; sie wird verschlüsselt gespeichert und nie wieder
          ganz angezeigt.
        </p>

        {settings.configured && !showInput ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Gespeicherte Adresse</p>
            <p className="break-all rounded-md border bg-muted px-3 py-2 font-mono text-[13px]">
              {maskedFeedUrl(settings.feedHost)}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={FEED_INPUT_ID}>
              {settings.configured ? "Neue Feed-Adresse" : "Feed-Adresse"}
            </Label>
            <Input
              id={FEED_INPUT_ID}
              type="password"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://timewarp.innoq.io/export/…/calendar.ics"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setSaveError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && trimmed && !save.isPending) {
                  event.preventDefault();
                  handleSave();
                }
              }}
              aria-invalid={saveError ? true : undefined}
              aria-describedby="calendar-feed-hint"
            />
            <p
              id="calendar-feed-hint"
              className="text-[13px] text-muted-foreground"
            >
              Beim Speichern ruft r-worktime den Feed einmal zur Probe ab.
            </p>
          </div>
        )}

        {saveError ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Feed nicht gespeichert</AlertTitle>
            <AlertDescription className="break-words">
              {saveError}
            </AlertDescription>
          </Alert>
        ) : null}

        {lastTest ? <FeedTestResult test={lastTest} /> : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {showInput ? (
            <>
              <Button
                type="button"
                className="h-11 sm:h-9"
                onClick={handleSave}
                disabled={!trimmed || save.isPending}
              >
                {save.isPending && (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                )}
                Speichern und testen
              </Button>
              {settings.configured ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 sm:h-9"
                  onClick={() => {
                    setEditing(false);
                    setUrl("");
                    setSaveError(null);
                  }}
                  disabled={save.isPending}
                >
                  Abbrechen
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-9"
              onClick={() => {
                setEditing(true);
                setLastTest(null);
              }}
            >
              <Pencil aria-hidden="true" />
              Ändern
            </Button>
          )}
          {settings.configured ? (
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9"
                  disabled={save.isPending}
                >
                  <Trash2 aria-hidden="true" />
                  Entfernen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Feed entfernen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Danach gleicht r-worktime keine Abwesenheiten mehr mit
                    Timewarp ab.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-primary-foreground hover:bg-destructive/90"
                    onClick={(event) => {
                      event.preventDefault();
                      handleRemove();
                    }}
                    disabled={save.isPending}
                  >
                    {save.isPending && (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    )}
                    Feed entfernen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </PanelBody>
    </Panel>
  );
}
