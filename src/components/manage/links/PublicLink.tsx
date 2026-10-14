import { ButtonLink } from "@/components/ui/Button";

/**
 * Row action of the workspace tables: open the public page of something the
 * bureau published. The visible word stays short ("Voir"); the accessible
 * name says which page, so a list of identical buttons stays meaningful.
 */
export function PublicLink({ href, title, label = "Voir" }: { href: string; title: string; label?: string }) {
  return (
    <ButtonLink
      href={href}
      variant="ghost"
      size="sm"
      icon="arrow-up-right"
      aria-label={`${label} « ${title} » sur le site`}
      className="px-2.5"
    >
      {label}
    </ButtonLink>
  );
}
