import type { ReactNode } from "react";
import type { SafetyContact } from "@/lib/types";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PlaceholderTag } from "./PlaceholderTag";

/**
 * A campus contact (the BDE's cell, the school's listening cell) as a ruled
 * entry: who runs it, what they do, then hours, room, people and address.
 * While the details are placeholders, the entry says so in plain words.
 */
export function CampusContact({ contact, headingLevel = 4 }: { contact: SafetyContact; headingLevel?: 3 | 4 }) {
  const H = headingLevel === 3 ? "h3" : "h4";
  return (
    <article className="border-t-2 border-fg pb-8 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="type-label text-muted">{contact.runBy}</p>
          <H className="mt-1.5 type-card text-[1.35rem]">{contact.name}</H>
        </div>
        {contact.toConfirmBy && (
          <PlaceholderTag>Exemple · à confirmer par {contact.toConfirmBy === "BDE" ? "le BDE" : "l'école"}</PlaceholderTag>
        )}
      </div>
      <p className="mt-3 max-w-xl text-muted">{contact.summary}</p>
      <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {contact.hours && (
          <Fact icon="clock" label="Horaires">
            {contact.hours}
          </Fact>
        )}
        {contact.place && (
          <Fact icon="pin" label="Où">
            {contact.place}
          </Fact>
        )}
        {contact.people && (
          <Fact icon="user" label="Qui te lit">
            {contact.people}
          </Fact>
        )}
        {contact.email && (
          <Fact icon="mail" label="Écrire">
            <a href={`mailto:${contact.email}`} className="link break-all font-semibold">
              {contact.email}
            </a>
          </Fact>
        )}
      </dl>
    </article>
  );
}

function Fact({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon name={icon} size={18} className="mt-0.5 shrink-0 text-subtle" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="type-label text-subtle">{label}</dt>
        <dd className="font-semibold leading-snug">{children}</dd>
      </div>
    </div>
  );
}
