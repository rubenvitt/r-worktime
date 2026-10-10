"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FilterChips } from "@/components/app/filter-chips";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/lib/format";
import {
  ARBZG_RULE_LABELS,
  ARBZG_RULES,
  type ArbzgFinding,
  type ArbzgRule,
  describeFinding,
} from "@/lib/reports/patterns";

const INITIAL_VISIBLE = 12;

type RuleFilter = ArbzgRule | "all";

/** Hinweise zum Arbeitszeitgesetz mit Sprung in die jeweilige Woche. */
export function ArbzgPanel({
  findings,
  counts,
  findingDays,
  workDays,
  hasHolidays,
}: {
  findings: ArbzgFinding[];
  counts: Record<ArbzgRule, number>;
  findingDays: number;
  workDays: number;
  /** Feiertagseinträge im Zeitraum vorhanden */
  hasHolidays: boolean;
}) {
  const [filter, setFilter] = useState<RuleFilter>("all");
  const [expanded, setExpanded] = useState(false);

  const filtered =
    filter === "all" ? findings : findings.filter((f) => f.rule === filter);
  const visible = expanded ? filtered : filtered.slice(0, INITIAL_VISIBLE);

  return (
    <Panel>
      <PanelHeader
        title="Hinweise zum Arbeitszeitgesetz"
        meta={
          findings.length > 0
            ? `${findingDays} von ${workDays} ${workDays === 1 ? "Tag" : "Tagen"} auffällig`
            : undefined
        }
      />
      <PanelBody className="space-y-4">
        <p className="max-w-prose text-[13px] text-muted-foreground">
          Automatischer Abgleich der erfassten Zeiten mit den Grenzen aus §§ 3,
          4, 5 und 9 ArbZG. Das sind Hinweise, keine rechtliche Bewertung –
          Ausnahmen (z. B. Tarifverträge, Ausgleichszeiträume, Bereitschaft)
          kennt die App nicht.
        </p>

        <ul className="grid grid-cols-2 gap-px overflow-clip rounded-lg border bg-border md:grid-cols-4">
          {ARBZG_RULES.map((rule) => (
            <li key={rule} className="bg-card px-3 py-2">
              <div className="text-xs text-muted-foreground">
                {ARBZG_RULE_LABELS[rule].paragraph}
              </div>
              <div className="text-[13px]">{ARBZG_RULE_LABELS[rule].title}</div>
              <div
                className={
                  counts[rule] > 0
                    ? "num mt-1 text-lg font-semibold text-warning"
                    : "num mt-1 text-lg font-semibold text-muted-foreground"
                }
              >
                {counts[rule]}
              </div>
            </li>
          ))}
        </ul>

        {findings.length === 0 ? (
          <p className="flex items-center gap-2 text-sm">
            <CircleCheck
              aria-hidden="true"
              className="size-4 shrink-0 text-positive"
            />
            Keine Auffälligkeiten im gewählten Zeitraum.
          </p>
        ) : (
          <>
            <FilterChips<RuleFilter>
              value={filter}
              onChange={(value) => {
                setFilter(value);
                setExpanded(false);
              }}
              ariaLabel="Hinweise filtern"
              options={[
                { value: "all", label: "Alle", count: findings.length },
                ...ARBZG_RULES.filter((rule) => counts[rule] > 0).map(
                  (rule) => ({
                    value: rule,
                    label: ARBZG_RULE_LABELS[rule].short,
                    count: counts[rule],
                  }),
                ),
              ]}
            />
            <ul className="-mx-4 divide-y border-y">
              {visible.map((finding) => (
                <FindingRow
                  key={`${finding.date}-${finding.rule}`}
                  finding={finding}
                />
              ))}
            </ul>
            {filtered.length > INITIAL_VISIBLE ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 md:h-8"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded
                  ? "Weniger anzeigen"
                  : `Alle ${filtered.length} Hinweise anzeigen`}
              </Button>
            ) : null}
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Netto = Vereinigung aller Einträge eines Tages; als Ruhepause (§ 4)
          zählen nur Lücken ab 15 Minuten. Feiertage stammen aus den
          importierten Feiertagseinträgen
          {hasHolidays ? "" : " – für diesen Zeitraum sind keine hinterlegt"}.
        </p>
      </PanelBody>
    </Panel>
  );
}

function FindingRow({ finding }: { finding: ArbzgFinding }) {
  const label = ARBZG_RULE_LABELS[finding.rule];
  return (
    <li>
      <Link
        href={`/week/${finding.isoYear}/${finding.isoWeek}`}
        className="flex min-h-11 flex-col gap-1 px-4 py-2 transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:gap-3"
      >
        <span className="flex shrink-0 items-center gap-2 sm:w-44">
          <span className="num text-sm font-medium">
            {formatDateShort(finding.date)}
          </span>
          <span className="num text-xs text-muted-foreground">
            KW {finding.isoWeek}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 items-start gap-2 text-sm">
          <Badge variant="warning" className="shrink-0">
            <TriangleAlert aria-hidden="true" />
            {label.paragraph.replace(" ArbZG", "")}
          </Badge>
          <span className="min-w-0">
            <span className="sr-only">{label.title}: </span>
            {describeFinding(finding)}
          </span>
        </span>
      </Link>
    </li>
  );
}
