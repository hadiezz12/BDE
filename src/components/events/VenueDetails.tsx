import type { Venue } from "@/lib/types";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/** Addresses that are not a place yet ("Adresse envoyée aux inscrit·es", "Lieu annoncé en janvier"). */
const NOT_A_PLACE = /envoy|annonc|partout/i;

/**
 * Directions in the student's maps app: a plain external search, no embed,
 * no tracking. Null on campus (everyone knows the way) and while the venue
 * is still a promise.
 */
export function itineraryHref(venue: Venue): string | null {
  if (venue.onCampus || !venue.address) return null;
  if (NOT_A_PLACE.test(venue.address) || NOT_A_PLACE.test(venue.name)) return null;
  const destination = [venue.name, venue.address, venue.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** Where, in full: name, address, city or "sur le campus", and the way there. */
export function VenueDetails({ venue, className }: { venue: Venue; className?: string }) {
  const href = itineraryHref(venue);
  const area = venue.onCampus ? ["Sur le campus", venue.city].filter(Boolean).join(", ") : venue.city;
  return (
    <div className={cx("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="font-bold leading-snug">{venue.name}</span>
      {venue.address && <span className="type-small text-muted">{venue.address}</span>}
      {area && <span className="type-small text-muted">{area}</span>}
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
