"use client";

import { Extension, Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { toSafeHref } from "@/lib/posts/document";
import { ImageBlockView } from "./ImageBlockView";
import type { ImageAttrs } from "./media-context";

/**
 * The editor knows exactly the article format of src/lib/posts/document.ts
 * and nothing else: paragraphs, two levels of subheads, bold, italic, links,
 * lists, quotes, dividers, line breaks and library images. Whatever is
 * pasted from another site goes through this schema, so unknown elements
 * (scripts, tables, iframes, styles, outside images) are dropped and only
 * their text stays. The server normalizes and checks everything again.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    postImage: {
      /** Inserts a library image as its own block at the cursor. */
      insertPostImage: (attrs: ImageAttrs) => ReturnType;
    };
  }
}

/**
 * A library image: a reference (mediaId), never a URL. In HTML (copy and
 * paste inside the editor) it is a <figure data-media-id>; an <img> pasted
 * from elsewhere matches nothing and is dropped.
 */
export const PostImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      mediaId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-media-id"),
        renderHTML: (attrs) => ({ "data-media-id": attrs.mediaId }),
      },
      alt: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-alt") || null,
        renderHTML: (attrs) => (attrs.alt ? { "data-alt": attrs.alt } : {}),
      },
      caption: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-caption") || null,
        renderHTML: (attrs) => (attrs.caption ? { "data-caption": attrs.caption } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-media-id]",
        getAttrs: (el) => (UUID.test((el as HTMLElement).getAttribute("data-media-id") ?? "") ? null : false),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertPostImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView, {
      // The block's own buttons (description, remove) are not editor clicks.
      stopEvent: ({ event }) => event.target instanceof Element && event.target.closest("button") !== null,
    });
  },
});

/**
 * What the text asks of the editor around it, as DOM events bubbling from
 * the editing surface: Ctrl/Cmd+K (open the link dialog), a file dropped or
 * pasted (images go through the library, never inline data).
 */
export const LINK_EVENT = "post-editor:link";
export const FILE_EVENT = "post-editor:file";

const LinkShortcut = Extension.create({
  name: "linkShortcut",
  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        this.editor.view.dom.dispatchEvent(new CustomEvent(LINK_EVENT, { bubbles: true }));
        return true;
      },
    };
  },
});

/** Drop and paste handlers of the editing surface: files never enter the text. */
export const fileHandlers = {
  handleDrop: (view: EditorView, event: DragEvent) => {
    if (!event.dataTransfer?.files.length) return false;
    event.preventDefault();
    view.dom.dispatchEvent(new CustomEvent(FILE_EVENT, { bubbles: true }));
    return true;
  },
  handlePaste: (view: EditorView, event: ClipboardEvent) => {
    const clip = event.clipboardData;
    if (!clip?.files.length || clip.getData("text/html")) return false;
    event.preventDefault();
    view.dom.dispatchEvent(new CustomEvent(FILE_EVENT, { bubbles: true }));
    return true;
  },
};

export function postExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      // Not part of the article format.
      code: false,
      codeBlock: false,
      strike: false,
      underline: false,
      // An image or a divider at the end needs no empty paragraph after it
      // (the gap cursor reaches past it); an empty paragraph would also
      // count as a change on the first click.
      trailingNode: false,
      link: {
        openOnClick: false,
        enableClickSelection: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        protocols: [],
        // Only the address is kept: how a link opens is the site's decision (RichText).
        HTMLAttributes: { target: null, rel: null, class: null },
        isAllowedUri: (url) => toSafeHref(url) !== null,
      },
      dropcursor: { color: "var(--fg)", width: 3 },
    }),
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === "heading" ? "Intertitre" : "Écris le texte ici…"),
    }),
    PostImage,
    LinkShortcut,
  ];
}

/**
 * Links as typed or pasted → their stored form: "HTTPS://Site.fr" and
 * "site.fr" become safe addresses; what cannot (javascript:, ftp:…) loses
 * its link and keeps its text. Run before normalizeDocument, which keeps
 * only safe links.
 */
export function cleanLinks(doc: JSONContent): JSONContent {
  const marks = doc.marks
    ?.map((m) => {
      if (m.type !== "link") return m;
      const href = typeof m.attrs?.href === "string" ? toSafeHref(m.attrs.href) : null;
      return href ? { type: "link", attrs: { href } } : null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);
  return {
    ...doc,
    ...(doc.marks ? { marks } : {}),
    ...(doc.content ? { content: doc.content.map(cleanLinks) } : {}),
  };
}

/** The editor needs at least one block to place the cursor in. */
export function editorContent(doc: { type: "doc"; content: unknown[] }): JSONContent {
  return doc.content.length ? (doc as JSONContent) : { type: "doc", content: [{ type: "paragraph" }] };
}
