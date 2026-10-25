import type { Venue } from "@/lib/types";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/**
 * Directions in the student's maps app: a plain external link, no embed, no
 * tracking, built only from what the organizer typed — the exact coordinates
 * when they gave some, otherwise the address. Null without an address (a
 * venue name alone is not a place a map can be trusted to find), and on
 * campus without one (everyone knows the way).
 */
export function itineraryHref(venue: Venue): string | null {
  if (venue.type === "online") return null;
  if (venue.latitude !== undefined && venue.longitude !== undefined) {
    return `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`;
  }
  if (!venue.address) return null;
  const destination = [venue.name, venue.address, venue.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** Where, in full: the place (name, address, city or "sur le campus") or "en ligne", and the way there. */
export function VenueDetails({ venue, className }: { venue: Venue; className?: string }) {
  if (venue.type === "online") {
    return (
      <div className={cx("flex min-w-0 flex-col gap-0.5", className)}>
        <span className="font-bold leading-snug">En ligne</span>
        {venue.onlineUrl && (
          <a
            href={venue.onlineUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 self-start type-small font-bold text-assoc-text hover:underline"
          >
            Suivre en ligne
            <Icon name="external" size={14} />
            <span className="sr-only">(site extérieur, nouvel onglet)</span>
          </a>
        )}
        {venue.hasPrivateDetails && (
          <span className="type-small text-muted">Le lien de connexion est donné aux inscrit·es.</span>
        )}
      </div>
    );
  }

  const href = itineraryHref(venue);
  const area = venue.onCampus ? ["Sur le campus", venue.city].filter(Boolean).join(", ") : venue.city;
  return (
    <div className={cx("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="font-bold leading-snug">{venue.name ?? (venue.onCampus ? "Sur le campus" : "Lieu à venir")}</span>
      {venue.address && <span className="type-small text-muted">{venue.address}</span>}
      {area && <span className="type-small text-muted">{area}</span>}
      {venue.hasPrivateDetails && <span className="type-small text-muted">Infos d&apos;accès données aux inscrit·es.</span>}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex items-center gap-1.5 self-start type-small font-bold text-assoc-text hover:underline"
        >
          Ouvrir l&apos;itinéraire
          <Icon name="external" size={14} />
          <span className="sr-only">(nouvel onglet)</span>
        </a>
      )}
    </div>
  );
}
