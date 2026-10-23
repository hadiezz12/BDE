"use client";

import { useState } from "react";
import { formatScheduled, parisLocalToInstant } from "@/lib/posts/schedule";
import { Field, Input } from "@/components/ui/Field";

/** yyyy-mm-dd + n days (calendar arithmetic, no time zone involved). */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The day and time of a scheduled publication, in Paris time whatever the
 * device's own time zone (the server converts them, daylight saving
 * included). The chosen moment is read back in words as it is typed, and
 * the two daylight-saving nights are explained instead of guessed.
 */
export function ScheduleFields({ today, initial }: { today: string; initial?: { date: string; time: string } }) {
  const [date, setDate] = useState(initial?.date ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const at = date && time ? parisLocalToInstant(date, time) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jour">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="date"
              name="date"
              required
              min={today}
              max={addDays(today, 365)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>
        <Field label="Heure">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="time"
              name="time"
              required
              step={60}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          )}
        </Field>
      </div>
      <p className="type-small text-subtle">
        Heure de Paris, quel que soit le fuseau de ton téléphone ou de ton ordinateur. Deux minutes à l&apos;avance au
        moins, un an au plus.
      </p>
      <p aria-live="polite" className="type-small font-semibold">
        {at?.ok
          ? `Mise en ligne prévue le ${formatScheduled(at.iso, at.ambiguous)}${
              at.ambiguous ? " : cette heure revient deux fois cette nuit-là, c'est la première, avant le changement d'heure." : "."
            }`
          : at && at.reason === "nonexistent"
            ? "Cette heure n'existe pas ce jour-là à Paris (passage à l'heure d'été) : choisis 3 h ou plus tard."
            : null}
      </p>
    </div>
  );
}
