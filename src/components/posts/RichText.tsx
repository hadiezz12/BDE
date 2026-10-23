import Image from "next/image";
import type { ReactNode } from "react";
import type { AccentKey, Photo, PostKind } from "@/lib/types";
import { cx } from "@/lib/cx";
import { isPrivateMedia } from "@/lib/media-url";
import {
  isExternalHref,
  isSafeHref,
  type BlockNode,
  type InlineNode,
  type ListItem,
  type PostDocument,
} from "@/lib/posts/document";

/**
 * Renders an article body from its structured document, element by
 * element: every string goes through React as text, links are checked again
 * here, images come only from the association's library (resolved by id to
 * the site's own media routes). There is no HTML injection anywhere.
 *
 * Typography for long reading on paper: ~18px, generous leading, a 40rem
 * measure, two levels of subheads, quotes ruled in the association's colour,
 * figures that keep their own proportions with a caption underneath, and the
 * sticker-printed drop cap of the Phase 1 design on the first paragraph.
 */

const DROP_CAP =
  "first-letter:float-left first-letter:mr-3 first-letter:mt-[0.06em] first-letter:text-[4.4em] first-letter:leading-[0.8] " +
  "first-letter:font-black first-letter:[font-stretch:70%] first-letter:text-accent first-letter:[text-shadow:3px_3px_0_var(--fg)]";

const NEW_TAB = "nouvel onglet";

function Inline({ nodes }: { nodes?: InlineNode[] }) {
  if (!nodes?.length) return null;
  return (
    <>
      {nodes.map((n, i) => {
        if (n.type === "hardBreak") return <br key={i} />;
        let el: ReactNode = n.text;
        for (const m of n.marks ?? []) {
          if (m.type === "bold") el = <strong className="font-bold">{el}</strong>;
          else if (m.type === "italic") el = <em>{el}</em>;
        }
        const link = n.marks?.find((m) => m.type === "link");
        if (link && link.type === "link" && isSafeHref(link.attrs.href)) {
          const external = isExternalHref(link.attrs.href);
          el = (
            <a
              href={link.attrs.href}
              {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" } : {})}
              className="font-semibold text-fg underline decoration-assoc decoration-2 underline-offset-[0.18em] hover:decoration-fg"
            >
              {el}
              {external && <span className="sr-only"> ({NEW_TAB})</span>}
            </a>
          );
        }
        return <span key={i}>{el}</span>;
      })}
    </>
  );
}

function Blocks({
  nodes,
  media,
  dropCap,
  sizes,
}: {
  nodes: (BlockNode | ListItem)[];
  media: Record<string, Photo>;
  dropCap: boolean;
  sizes: string;
}) {
  // The drop cap goes on the first paragraph that has text.
  const capIndex = dropCap ? nodes.findIndex((n) => n.type === "paragraph" && Boolean(n.content?.length)) : -1;
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "paragraph": {
            const cap = i === capIndex;
            return n.content?.length ? (
              <p key={i} className={cx(cap && DROP_CAP)}>
                <Inline nodes={n.content} />
              </p>
            ) : null;
          }
          case "heading":
            return n.attrs.level === 2 ? (
              <h2 key={i} className="mt-6 text-[1.55rem] font-extrabold leading-[1.15] [font-stretch:92%] sm:text-[1.75rem]">
                <Inline nodes={n.content} />
              </h2>
            ) : (
              <h3 key={i} className="mt-3 text-[1.2rem] font-extrabold leading-snug [font-stretch:96%]">
                <Inline nodes={n.content} />
              </h3>
            );
          case "bulletList":
          case "orderedList": {
            const List = n.type === "bulletList" ? "ul" : "ol";
            return (
              <List
                key={i}
                className={cx(
                  "flex flex-col gap-2 pl-6",
                  n.type === "bulletList" ? "list-[square] marker:text-assoc-text" : "list-decimal marker:font-bold marker:text-assoc-text",
                )}
              >
                {n.content.map((item, j) => (
                  <li key={j} className="pl-1 [&>p]:m-0">
                    <Blocks nodes={item.content} media={media} dropCap={false} sizes={sizes} />
                  </li>
                ))}
              </List>
            );
          }
          case "blockquote":
            return (
              <blockquote
                key={i}
                className="flex flex-col gap-4 border-l-4 border-assoc py-1 pl-5 text-[1.2rem] font-semibold leading-[1.6] [font-stretch:96%]"
              >
                <Blocks nodes={n.content} media={media} dropCap={false} sizes={sizes} />
              </blockquote>
            );
          case "horizontalRule":
            return (
              <hr key={i} aria-hidden className="mx-auto my-4 h-2 w-24 border-0 bg-[radial-gradient(circle,var(--fg)_1.5px,transparent_2px)] bg-[length:12px_8px] bg-repeat-x" />
            );
          case "image": {
            const photo = media[n.attrs.mediaId];
            if (!photo) return null;
            return (
              <figure key={i} className="my-2 flex flex-col gap-2">
                <Image
                  src={photo.src}
                  alt={n.attrs.alt ?? photo.alt ?? ""}
                  width={photo.width}
                  height={photo.height}
                  sizes={sizes}
                  unoptimized={isPrivateMedia(photo.src)}
                  className="h-auto w-full border-2 border-fg"
                />
                {n.attrs.caption && <figcaption className="type-caption">{n.attrs.caption}</figcaption>}
              </figure>
            );
          }
          case "listItem":
            return (
              <Blocks key={i} nodes={n.content} media={media} dropCap={false} sizes={sizes} />
            );
          default:
            return null;
        }
      })}
    </>
  );
}

export function RichText({
  doc,
  media,
  kind,
  accent = "rose",
  sizes = "(min-width: 1024px) 40rem, 100vw",
  className,
}: {
  doc: PostDocument;
  media: Record<string, Photo>;
  kind: PostKind;
  /** Colours quote rules and list markers. */
  accent?: AccentKey;
  sizes?: string;
  className?: string;
}) {
  return (
    <div
      data-accent={accent}
      className={cx("flex max-w-[40rem] flex-col gap-5 text-[1.0625rem] leading-[1.75] sm:text-[1.125rem]", className)}
    >
      <Blocks nodes={doc.content} media={media} dropCap={kind === "article" || kind === "recap"} sizes={sizes} />
    </div>
  );
}
