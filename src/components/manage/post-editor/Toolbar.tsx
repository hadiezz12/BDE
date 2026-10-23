"use client";

import { Fragment, useRef, useState, type KeyboardEvent } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/ui/Icon";

interface Tool {
  key: string;
  label: string;
  icon?: IconName;
  /** Shown instead of an icon (H2, H3). */
  text?: string;
  /** "B" for Ctrl/Cmd+B; "Shift+7" for Ctrl/Cmd+Shift+7. */
  shortcut?: string;
  /** Toggles report their state (aria-pressed); actions leave it out. */
  pressed?: boolean;
  disabled?: boolean;
  run: () => void;
}

const isApple = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * The formatting bar: one tab stop (a WAI-ARIA toolbar), arrows move between
 * the buttons, each says what it does (aria-label, shortcut in its tooltip)
 * and whether it is on (aria-pressed). Buttons never take the focus from the
 * text on a mouse click, so the selection stays where it was. On phones the
 * bar scrolls sideways inside its own width, never the page.
 */
export function Toolbar({
  editor,
  onLink,
  onImage,
  className,
}: {
  editor: Editor;
  onLink: () => void;
  onImage: () => void;
  className?: string;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const [current, setCurrent] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const apple = isApple();
  const mod = apple ? "⌘" : "Ctrl";
  const chain = () => editor.chain().focus();

  const groups: Tool[][] = [
    [
      { key: "undo", label: "Annuler", icon: "undo", shortcut: "Z", disabled: !state.canUndo, run: () => chain().undo().run() },
      { key: "redo", label: "Rétablir", icon: "redo", shortcut: "Shift+Z", disabled: !state.canRedo, run: () => chain().redo().run() },
    ],
    [
      {
        key: "h2",
        label: "Intertitre",
        text: "H2",
        shortcut: "Alt+2",
        pressed: state.h2,
        run: () => chain().toggleHeading({ level: 2 }).run(),
      },
      {
        key: "h3",
        label: "Petit intertitre",
        text: "H3",
        shortcut: "Alt+3",
        pressed: state.h3,
        run: () => chain().toggleHeading({ level: 3 }).run(),
      },
    ],
    [
      { key: "bold", label: "Gras", icon: "bold", shortcut: "B", pressed: state.bold, run: () => chain().toggleBold().run() },
      { key: "italic", label: "Italique", icon: "italic", shortcut: "I", pressed: state.italic, run: () => chain().toggleItalic().run() },
      { key: "link", label: state.link ? "Modifier le lien" : "Lien", icon: "link", shortcut: "K", pressed: state.link, run: onLink },
    ],
    [
      {
        key: "bullet",
        label: "Liste à puces",
        icon: "list",
        shortcut: "Shift+8",
        pressed: state.bullet,
        run: () => chain().toggleBulletList().run(),
      },
      {
        key: "ordered",
        label: "Liste numérotée",
        icon: "list-ordered",
        shortcut: "Shift+7",
        pressed: state.ordered,
        run: () => chain().toggleOrderedList().run(),
      },
      {
        key: "quote",
        label: "Citation",
        icon: "quote",
        shortcut: "Shift+B",
        pressed: state.quote,
        run: () => chain().toggleBlockquote().run(),
      },
    ],
    [
      { key: "image", label: "Image", icon: "image", run: onImage },
      { key: "divider", label: "Séparateur", icon: "minus", run: () => chain().setHorizontalRule().run() },
    ],
  ];
  const tools = groups.flat();

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const last = tools.length - 1;
    const next =
      event.key === "ArrowRight"
        ? current === last
          ? 0
          : current + 1
        : event.key === "ArrowLeft"
          ? current === 0
            ? last
            : current - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setCurrent(next);
    refs.current[next]?.focus();
    refs.current[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const offsets = groups.map((_, g) => groups.slice(0, g).reduce((n, group) => n + group.length, 0));
  return (
    <div
      role="toolbar"
      aria-label="Mise en forme du texte"
      onKeyDown={move}
      className={cx(
        "flex min-w-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // Phones: the bar fades at its edge, a sign that it scrolls sideways.
        "max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)]",
        className,
      )}
    >
      {groups.map((group, g) => (
        <Fragment key={g}>
          {g > 0 && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line-strong/60" />}
          {group.map((tool, j) => {
            const i = offsets[g] + j;
            const keys = tool.shortcut ? `${mod}+${tool.shortcut}` : undefined;
            return (
              <button
                key={tool.key}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                tabIndex={i === current ? 0 : -1}
                aria-label={tool.label}
                aria-pressed={tool.pressed}
                aria-disabled={tool.disabled || undefined}
                aria-keyshortcuts={tool.shortcut ? `${apple ? "Meta" : "Control"}+${tool.shortcut}` : undefined}
                title={keys ? `${tool.label} (${keys})` : tool.label}
                // Keep the text's selection: the button acts, the focus stays in the text.
                onMouseDown={(e) => e.preventDefault()}
                onFocus={() => setCurrent(i)}
                onClick={() => {
                  if (!tool.disabled) tool.run();
                }}
                className={cx(
                  "inline-flex size-11 shrink-0 items-center justify-center rounded-sm transition-colors",
                  "aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
                  // The hover tint only on unpressed buttons: on a pressed one it would hide the icon.
                  tool.pressed ? "bg-fg text-bg" : "text-fg hover:bg-fg/8",
                )}
              >
                {tool.icon ? (
                  <Icon name={tool.icon} size={20} />
                ) : (
                  <span aria-hidden className="text-[0.95rem] font-black [font-stretch:85%]">
                    {tool.text}
                  </span>
                )}
              </button>
            );
          })}
        </Fragment>
      ))}
      {/* Room for the fade, so the last button can scroll fully into view. */}
      <span aria-hidden className="w-5 shrink-0 sm:hidden" />
    </div>
  );
}
