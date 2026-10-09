"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { FilterChips } from "@/components/app/filter-chips";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";

type ThemeChoice = "light" | "dark" | "system";

const OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: "light", label: "Hell" },
  { value: "dark", label: "Dunkel" },
  { value: "system", label: "System" },
];

function isThemeChoice(value: string | undefined): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/** Darstellung (Hell/Dunkel/System), gleiche Quelle wie das Benutzermenü. */
export function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  // Erst nach dem Mount ist das gespeicherte Theme bekannt (sonst Hydration-Differenz)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const value: ThemeChoice = mounted && isThemeChoice(theme) ? theme : "system";

  return (
    <Panel aria-labelledby="appearance-title">
      <PanelHeader title={<span id="appearance-title">Darstellung</span>} />
      <PanelBody className="space-y-3">
        <p className="text-[13px] text-muted-foreground">
          Gilt für dieses Gerät. „System“ folgt der Einstellung deines
          Betriebssystems.
        </p>
        {mounted ? (
          <FilterChips
            ariaLabel="Darstellung"
            value={value}
            onChange={setTheme}
            options={OPTIONS}
          />
        ) : (
          <div className="h-11 md:h-8" aria-hidden="true" />
        )}
      </PanelBody>
    </Panel>
  );
}
