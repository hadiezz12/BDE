"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { PostKind } from "@/lib/types";
import type { LibraryImage, PostEditor as PostEditorData } from "@/lib/posts/editor";
import { normalizePostContent, POST_LIMITS } from "@/lib/posts/content";
import { documentText, normalizeDocument, qualityNotes, type PostDocument } from "@/lib/posts/document";
import { postStage } from "@/lib/posts/model";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PostStageBadge } from "@/components/posts/PostStageBadge";
import { Notice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { POST_KIND_LABEL } from "@/components/campus/labels";
import { FILE_EVENT, LINK_EVENT, cleanLinks, editorContent, fileHandlers, postExtensions } from "./extensions";
import { GrowingTextarea } from "./GrowingTextarea";
import { ImagePicker, type PickerRequest } from "./ImagePicker";
import { clock, stamp } from "./labels";
import { LinkDialog, type LinkRequest } from "./LinkDialog";
import { PostMediaContext, type ImageAttrs, type PostMediaContextValue } from "./media-context";
import { PreviewLink } from "./PreviewLinks";
import { PROSE } from "./prose";
import { SaveStatus } from "./SaveStatus";
import { QualityNotes, SettingsPanel } from "./SettingsPanel";
import { Toolbar } from "./Toolbar";
import { useAutosave, type Collected } from "./useAutosave";
import { UnlockedNote, VersionBanner, frozenReason } from "./VersionBanner";
import { isComplete, planWorkflow, previewHref } from "./workflow";
import { WorkflowPanel, type WorkflowPause } from "./WorkflowPanel";

export type EditorReadOnly = "organization_suspended" | "organization_archived" | "membership_suspended";

type Panel = "texte" | "reglages" | "publication";

const PANELS: { key: Panel; label: string }[] = [
  { key: "texte", label: "Texte" },
  { key: "reglages", label: "Réglages" },
  { key: "publication", label: "Publication" },
];

/**
 * The fields of the sheet carry no box: the one being written in shows a
 * rule in the margin (the focus colour), so the focus stays visible without
 * framing the text.
 */
const FIELD_RULE = "-ml-3.5 border-l-2 border-transparent pl-3 outline-none transition-colors";

const BODY_ERROR: Record<string, string> = {
  too_long: "Le texte est trop long pour un seul article : coupe-le en deux.",
  too_deep: "Trop de listes ou de citations les unes dans les autres : simplifie la mise en forme.",
};

const FIELD_ERROR: Record<string, string> = {
  kind: "Choisis un type d'article.",
  title: `Le titre dépasse ${POST_LIMITS.title} caractères.`,
  intro: `L'introduction dépasse ${POST_LIMITS.intro} caractères.`,
  body: "Le texte n'a pas pu être lu : recharge la page.",
  cover: "L'image de couverture n'est pas valable : choisis-en une autre.",
  category: "La rubrique n'est pas valable : choisis-en une autre.",
  tags: `${POST_LIMITS.tags} mots-clés au plus.`,
};

/**
 * The post editor: the text on a sheet of paper set like the public article
 * (title, introduction, body), the formatting bar and the save status
 * sticking under the workspace bar, and beside it (below it on phones, as
 * tabs) what happens next, the post's settings and the editorial
 * reminders.
 *
 * The text is saved as it is written (useAutosave), always as the format of
 * src/lib/posts/document.ts. A frozen version (in review, sent back,
 * approved, online) opens read-only; "Modifier" unlocks it and the first
 * save starts a new version (the server says so, and the page then follows
 * it). The server's later payloads steer the status and the actions, never
 * the text on screen: nothing anyone else does replaces what is being
 * typed (a conflicting save is refused and explained instead).
 */
export function PostEditor({
  asso,
  data,
  mfa,
  readOnly,
  canPublishPage,
  today,
}: {
  asso: string;
  data: PostEditorData;
  mfa: boolean;
  readOnly: EditorReadOnly | null;
  canPublishPage: boolean;
  /** Today in Paris (yyyy-mm-dd), from the server. */
  today: string;
}) {
  const router = useRouter();
  const { post, working, can, organization } = data;
  const baseId = useId();
  const titleId = `${baseId}-titre`;
  const introId = `${baseId}-intro`;
  const bodyHintId = `${baseId}-aide`;

  // ---- What is written (from the loaded version, once) ---------------------------------
  const [kind, setKind] = useState<PostKind>(working.kind);
  const [title, setTitle] = useState(working.title);
  const [intro, setIntro] = useState(working.intro ?? "");
  const [categoryId, setCategoryId] = useState(working.category_id);
  const [tags, setTags] = useState(working.tags);
  const [coverId, setCoverId] = useState(working.cover_media_id);
  /** The body as last read from the editor (reminders, completeness), a moment after typing. */
  const [body, setBody] = useState<PostDocument>(working.body);
  const [initialContent] = useState(() => editorContent(working.body));
  const [loaded] = useState(() => {
    const content = normalizePostContent({ ...working, intro: working.intro ?? "", cover_media_id: working.cover_media_id });
    return content.ok ? content.value : null;
  });

  // ---- Around it -------------------------------------------------------------------------
  const [panel, setPanel] = useState<Panel>("texte");
  const [unlockedKey, setUnlockedKey] = useState<string | null>(null);
  const [link, setLink] = useState<LinkRequest | null>(null);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [uploaded, setUploaded] = useState<LibraryImage[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const editorRef = useRef<Editor | null>(null);
  const bodyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerKey = useRef(0);
  const switcherRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // ---- Saving ----------------------------------------------------------------------------
  const collect = useCallback((): Collected | null => {
    const e = editorRef.current;
    if (!e) return null;
    const doc = normalizeDocument(cleanLinks(e.getJSON()));
    if (!doc.ok) return { ok: false, message: BODY_ERROR[doc.reason] ?? FIELD_ERROR.body };
    const content = normalizePostContent({
      kind,
      title,
      intro,
      body: doc.value,
      cover_media_id: coverId,
      category_id: categoryId,
      tags,
    });
    return content.ok ? { ok: true, content: content.value } : { ok: false, message: FIELD_ERROR[content.field] };
  }, [kind, title, intro, coverId, categoryId, tags]);

  const { state, saved, savedAt, unsaved, touch, save, retry, release } = useAutosave({
    postId: post.id,
    initial: { revisionId: working.id, version: working.version, number: working.number },
    loaded,
    collect,
    onSaved: (result) => {
      if (result.created) {
        setAnnouncement(`Version n°${result.number} commencée : la précédente reste telle quelle.`);
        // The new version is now the working one: status, actions and history follow.
        router.refresh();
      }
    },
  });

  // ---- Who may change what ---------------------------------------------------------------
  const frozen = frozenReason(data);
  const lockKey = `${working.id}:${working.status}:${post.publication}`;
  const unlocked = frozen !== null && unlockedKey === lockKey;
  const editable = can.edit && !readOnly && (frozen === null || unlocked);
  const nextNumber = Math.max(working.number, ...data.history.map((h) => h.number)) + 1;

  // ---- The rich-text editor --------------------------------------------------------------
  const [extensions] = useState(postExtensions);
  const editorProps = useMemo(
    () => ({
      attributes: {
        class: PROSE,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Texte de l'article",
        "aria-describedby": bodyHintId,
        "aria-readonly": String(!editable),
      },
      ...fileHandlers,
    }),
    [bodyHintId, editable],
  );

  const onBodyChange = () => {
    touch();
    setFlash(null);
    if (bodyTimer.current) clearTimeout(bodyTimer.current);
    bodyTimer.current = setTimeout(() => {
      const doc = editorRef.current ? normalizeDocument(editorRef.current.getJSON()) : null;
      if (doc?.ok) setBody(doc.value);
    }, 400);
  };

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions,
    content: initialContent,
    editable,
    editorProps,
    onCreate: ({ editor: e }) => {
      editorRef.current = e;
    },
    onUpdate: ({ transaction }) => {
      if (transaction.docChanged) onBodyChange();
    },
  });

  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    if (editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  useEffect(
    () => () => {
      if (bodyTimer.current) clearTimeout(bodyTimer.current);
    },
    [],
  );

  // ---- Fields ----------------------------------------------------------------------------
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      touch();
      setFlash(null);
    };

  // ---- Links and images ------------------------------------------------------------------
  const openLink = useCallback(() => {
    const e = editorRef.current;
    if (!e || !e.isEditable) return;
    const href = (e.getAttributes("link").href as string | undefined) ?? null;
    setLink({ href, onText: href !== null || !e.state.selection.empty });
  }, []);

  const openPicker = useCallback((request: { mode: "inline" } | { mode: "cover"; current: string | null }) => {
    pickerKey.current += 1;
    setPicker({ ...request, key: pickerKey.current });
  }, []);

  // Ctrl/Cmd+K and files dropped or pasted, as the text reports them (extensions.ts).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onFile = () => {
      if (editorRef.current?.isEditable) openPicker({ mode: "inline" });
    };
    el.addEventListener(LINK_EVENT, openLink);
    el.addEventListener(FILE_EVENT, onFile);
    return () => {
      el.removeEventListener(LINK_EVENT, openLink);
      el.removeEventListener(FILE_EVENT, onFile);
    };
  }, [openLink, openPicker]);

  /** Runs once the dialog has closed and given the focus back, so the text gets it. */
  const afterDialog = (run: (e: Editor) => void) =>
    requestAnimationFrame(() => {
      if (editorRef.current) run(editorRef.current);
    });

  function applyLink(href: string, text: string | null) {
    const request = link;
    setLink(null);
    afterDialog((e) => {
      if (request?.onText) {
        e.chain().focus().extendMarkRange("link").setLink({ href }).run();
      } else {
        e.chain()
          .focus()
          .insertContent({ type: "text", text: text ?? href.replace(/^mailto:/, ""), marks: [{ type: "link", attrs: { href } }] })
          .unsetMark("link")
          .run();
      }
    });
  }

  function removeLink() {
    setLink(null);
    afterDialog((e) => e.chain().focus().extendMarkRange("link").unsetLink().run());
  }

  const library = useMemo(() => {
    const byId = new Map<string, LibraryImage>();
    for (const m of [...uploaded, ...data.media]) if (!byId.has(m.id)) byId.set(m.id, m);
    return byId;
  }, [uploaded, data.media]);

  const mediaContext = useMemo<PostMediaContextValue>(
    () => ({
      media: library,
      editable,
      editImage: (attrs: ImageAttrs, apply: (next: ImageAttrs) => void) => {
        pickerKey.current += 1;
        setPicker({
          mode: "details",
          key: pickerKey.current,
          attrs,
          apply: (next) => {
            setPicker(null);
            apply(next);
          },
        });
      },
    }),
    [library, editable],
  );

  // ---- Keyboard: Ctrl/Cmd+S saves now ------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (!editable) return;
      const pending = unsaved;
      void save().then((ok) => {
        if (ok) setAnnouncement(pending ? `Enregistré à ${clock(Date.now())}.` : "Tout est déjà enregistré.");
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, save, unsaved]);

  // ---- Conflict: keep the text, hand it over ----------------------------------------------
  async function copyMine() {
    const e = editorRef.current;
    if (!e) return;
    const text = [title.trim(), intro.trim(), e.getText({ blockSeparator: "\n\n" })].filter(Boolean).join("\n\n");
    const head = document.createElement("div");
    for (const [tag, value] of [
      ["h2", title.trim()],
      ["p", intro.trim()],
    ] as const) {
      if (!value) continue;
      const el = document.createElement(tag);
      el.textContent = value;
      head.append(el);
    }
    const html = head.innerHTML + e.getHTML();
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      } catch {
        setAnnouncement("La copie automatique n'a pas marché : sélectionne le texte et copie-le à la main.");
      }
    }
  }

  function reloadLatest() {
    release();
    window.location.reload();
  }

  // ---- What happens next -------------------------------------------------------------------
  const complete = isComplete(title, intro, documentText(body));
  const plan = planWorkflow({
    stage: postStage(post),
    post,
    working,
    history: data.history,
    reviewMode: data.settings.review_mode,
    organization,
    can: readOnly ? { edit: false, approve: false, review_this: false, publish: false, upload: false, delete: false } : can,
    complete,
  });
  // The actions apply to the saved version: wait while the text differs from it, while the page
  // catches up with a version this editor just started, or when someone else saved meanwhile
  // (a refused save, or a newer version seen on the last refresh).
  const pause: WorkflowPause =
    state.phase === "conflict"
      ? "conflict"
      : unsaved
        ? "unsaved"
        : saved.revisionId === working.id
          ? null
          : saved.number > working.number
            ? "refreshing"
            : "stale";
  const notes = useMemo(
    () => qualityNotes({ kind, title, intro: intro.trim() || null, doc: body, hasCover: Boolean(coverId) }),
    [kind, title, intro, body, coverId],
  );
  const short = organization.short_name ?? organization.name;
  const cover = coverId ? (library.get(coverId) ?? null) : null;

  function show(next: Panel) {
    setPanel(next);
    requestAnimationFrame(() => {
      const el = switcherRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
    });
  }

  const statusProps = { state, loadedAt: working.updated_at, today, onRetry: retry };

  return (
    <PostMediaContext.Provider value={mediaContext}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-line pb-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Link
              href={routes.manageContent(asso)}
              className="group -ml-1 inline-flex min-h-10 items-center gap-2 rounded-sm px-1 type-label text-muted hover:text-fg"
            >
              <Icon name="arrow-left" size={14} className="transition-transform group-hover:-translate-x-0.5" />
              Contenus
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <PreviewLink href={previewHref(post.id, undefined, false)} label="Aperçu" unsaved={unsaved} save={save} />
              <ButtonLink
                href={routes.manageContentHistory(asso, post.id)}
                variant="ghost"
                size="sm"
                icon="history"
                iconPosition="start"
              >
                Historique
              </ButtonLink>
            </div>
          </div>
          <h1 className="sr-only">{title.trim() ? `Article « ${title.trim()} »` : "Article sans titre"}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <p className="type-label text-assoc-text">
              {short} · {POST_KIND_LABEL[kind]} · version n°{saved.number}
            </p>
            <PostStageBadge post={post} />
          </div>
        </header>

        {(readOnly || post.hidden) && (
          <div className="flex flex-col gap-3">
            {readOnly && <ReadOnlyNotice reason={readOnly} />}
            {post.hidden && (
              <Notice tone="danger" icon="alert" title="Masqué par la modération du BDE">
                <p>
                  Depuis le {stamp(post.hidden.at)}. Raison donnée&nbsp;: {post.hidden.reason}
                </p>
                <p className="mt-1">
                  Personne ne le voit, et rien de ce que fait l&apos;asso (publier, programmer, sortir des archives) ne
                  le remet en ligne. Si tu penses que c&apos;est une erreur, écris au BDE&nbsp;: lui seul peut le
                  rétablir.
                </p>
              </Notice>
            )}
          </div>
        )}

        <div
          ref={switcherRef}
          role="group"
          aria-label="Partie de l'éditeur affichée"
          className="grid scroll-mt-16 grid-cols-3 gap-1 rounded-md border border-line bg-raised p-1 xl:hidden"
        >
          {PANELS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={panel === p.key}
              onClick={() => show(p.key)}
              className={cx(
                "min-h-11 rounded-sm px-2 type-button text-[0.75rem] transition-colors",
                panel === p.key ? "bg-fg text-bg" : "text-muted hover:bg-fg/8 hover:text-fg",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          {/* ---- The text ---- */}
          <section aria-labelledby={`${baseId}-texte`} className={cx("flex min-w-0 flex-col gap-4", panel !== "texte" && "max-xl:hidden")}>
            <h2 id={`${baseId}-texte`} className="sr-only">
              Texte
            </h2>

            {frozen && !unlocked && !readOnly && (
              <VersionBanner data={data} frozen={frozen} canEdit={can.edit} onUnlock={() => setUnlockedKey(lockKey)} />
            )}
            {frozen && unlocked && saved.revisionId === working.id && (
              <UnlockedNote number={working.number} next={nextNumber} submitted={frozen === "submitted"} />
            )}
            {!frozen && !can.edit && !readOnly && (
              <Notice tone="info" icon="lock" title="Lecture seule">
                <p>
                  Tu peux relire ce brouillon. Le modifier demande le droit «&nbsp;Modifier tous les articles&nbsp;», ou
                  de l&apos;avoir commencé avec «&nbsp;Écrire des articles&nbsp;».
                </p>
              </Notice>
            )}

            {editable && editor && (
              <div className="sticky top-[calc(3rem+1px)] z-20 -mx-1 flex items-center gap-x-3 gap-y-1 border-b border-line bg-bg px-1 py-1 sm:flex-wrap lg:top-[calc(3.5rem+1px)]">
                <Toolbar
                  editor={editor}
                  onLink={openLink}
                  onImage={() => openPicker({ mode: "inline" })}
                  className="grow basis-0 sm:basis-[37rem]"
                />
                <SaveStatus {...statusProps} compact className="shrink-0 sm:py-1.5" />
              </div>
            )}

            {state.phase === "conflict" && (
              <div role="alert">
                <Notice
                  tone="danger"
                  icon="alert"
                  title="Quelqu'un d'autre a enregistré cet article pendant que tu écrivais"
                  action={
                    <Button type="button" variant="secondary" size="sm" icon="history" iconPosition="start" onClick={reloadLatest}>
                      Recharger la dernière version
                    </Button>
                  }
                >
                  <p>
                    Pour ne rien écraser, l&apos;enregistrement s&apos;est arrêté. Ton texte est toujours là, à
                    l&apos;écran, mais il n&apos;est pas enregistré&nbsp;: copie-le, recharge la dernière version, puis
                    recolle ce que tu veux garder.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={copied ? "check" : "copy"}
                    iconPosition="start"
                    onClick={() => void copyMine()}
                    className="mt-2"
                  >
                    {copied ? "Texte copié" : "Copier mon texte"}
                  </Button>
                </Notice>
              </div>
            )}
            {state.phase === "error" && (
              <div role="alert">
                <Notice
                  tone="danger"
                  icon="alert"
                  title="Pas enregistré"
                  action={
                    state.retry ? (
                      <Button type="button" variant="secondary" size="sm" icon="undo" iconPosition="start" onClick={retry}>
                        Réessayer
                      </Button>
                    ) : undefined
                  }
                >
                  <SaveErrorText code={state.code} message={state.message} />
                </Notice>
              </div>
            )}

            <div
              data-surface="paper"
              className="flex flex-col gap-6 rounded-md border border-line-strong bg-bg px-5 py-6 text-fg shadow-sticker max-sm:mx-[calc(var(--gutter)*-1)] max-sm:rounded-none max-sm:border-x-0 sm:px-8 sm:py-9 2xl:px-12 2xl:py-12"
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={titleId} className="type-label text-subtle">
                    Titre
                  </label>
                  <Counter value={title} max={POST_LIMITS.title} from={110} id={`${titleId}-compte`} />
                </div>
                <GrowingTextarea
                  id={titleId}
                  value={title}
                  onValue={edit(setTitle)}
                  onEnter={() => document.getElementById(introId)?.focus()}
                  enterKeyHint="next"
                  readOnly={!editable}
                  maxLength={POST_LIMITS.title}
                  aria-describedby={`${titleId}-compte`}
                  autoComplete="off"
                  className={`${FIELD_RULE} focus-visible:border-[var(--focus)] type-headline break-words text-[clamp(1.75rem,1.05rem+2.6vw,2.75rem)] placeholder:text-subtle/60`}
                  placeholder={editable ? "Ex : la soirée de rentrée affiche complet" : undefined}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={introId} className="type-label text-subtle">
                    Introduction
                  </label>
                  <Counter value={intro} max={POST_LIMITS.intro} from={320} id={`${introId}-compte`} />
                </div>
                <GrowingTextarea
                  id={introId}
                  value={intro}
                  onValue={edit(setIntro)}
                  onEnter={() => editorRef.current?.commands.focus("start")}
                  enterKeyHint="next"
                  readOnly={!editable}
                  maxLength={POST_LIMITS.intro}
                  aria-describedby={`${introId}-aide ${introId}-compte`}
                  autoComplete="off"
                  placeholder={editable ? "Ex : ce qu'il faut retenir, en une ou deux phrases" : undefined}
                  className={`${FIELD_RULE} focus-visible:border-[var(--focus)] type-lead text-muted placeholder:text-subtle/60`}
                />
                <p id={`${introId}-aide`} className="type-caption">
                  Une ou deux phrases&nbsp;: c&apos;est elle qui s&apos;affiche dans le fil, sous le titre.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <p aria-hidden className="type-label text-subtle">
                  Texte
                </p>
                <p id={bodyHintId} className="sr-only">
                  Raccourcis : Contrôle B pour le gras, Contrôle I pour l&apos;italique, Contrôle K pour un lien. La
                  barre de mise en forme se trouve juste au-dessus. Dans une liste, Tab décale l&apos;élément ;
                  ailleurs, Tab quitte le texte.
                </p>
                <div ref={bodyRef} className={`${FIELD_RULE} has-[.ProseMirror-focused]:border-[var(--focus)]`}>
                  {editor ? (
                    <EditorContent editor={editor} />
                  ) : (
                    <div aria-hidden className="flex min-h-[14rem] flex-col gap-3 pt-1">
                      <span className="skeleton block h-4 w-full" />
                      <span className="skeleton block h-4 w-11/12" />
                      <span className="skeleton block h-4 w-3/5" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ---- Beside the text ---- */}
          <div className="flex min-w-0 flex-col gap-10">
            <PanelSection title="Publication" className={cx(panel !== "publication" && "max-xl:hidden")}>
              {flash && (
                <div role="status">
                  <Notice tone="info" icon="check" title={flash} />
                </div>
              )}
              <WorkflowPanel
                asso={asso}
                data={data}
                plan={plan}
                revisionId={saved.revisionId}
                complete={complete}
                pause={readOnly ? null : pause}
                onSaveNow={() => void save()}
                onDone={setFlash}
                mfa={mfa}
                canPublishPage={canPublishPage}
                today={today}
              />
            </PanelSection>

            <PanelSection title="Réglages" className={cx(panel !== "reglages" && "max-xl:hidden")}>
              {editable && <SaveStatus {...statusProps} className="xl:hidden" />}
              <SettingsPanel
                kind={kind}
                onKind={edit(setKind)}
                categoryId={categoryId}
                onCategory={edit(setCategoryId)}
                categories={data.categories}
                tags={tags}
                onTags={edit(setTags)}
                cover={cover}
                coverId={coverId}
                onPickCover={() => openPicker({ mode: "cover", current: coverId })}
                onRemoveCover={() => edit(setCoverId)(null)}
                disabled={!editable}
              />
            </PanelSection>

            <PanelSection title="Relire" className={cx(panel !== "reglages" && "max-xl:hidden")}>
              <QualityNotes notes={notes} />
              <div className="flex flex-wrap gap-2">
                <PreviewLink href={previewHref(post.id, undefined, false)} label="Aperçu ordinateur" unsaved={unsaved} save={save} />
                <PreviewLink
                  href={previewHref(post.id, undefined, true)}
                  label="Aperçu téléphone"
                  icon="phone"
                  unsaved={unsaved}
                  save={save}
                />
              </div>
              <p className="type-small text-subtle">
                L&apos;aperçu montre la version enregistrée telle que les étudiants la liront. Il n&apos;est visible que
                de l&apos;équipe.
              </p>
              <Link
                href={routes.manageContentHistory(asso, post.id)}
                className="group inline-flex min-h-10 items-center gap-1.5 self-start type-label hover:text-assoc-text"
              >
                <Icon name="history" size={14} />
                Toutes les versions
                <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </PanelSection>
          </div>
        </div>

        {/* Screen readers hear each confirmed save (once a minute at most: the
            words only change with the time), not every keystroke; failures are
            alerts of their own, above the text. */}
        <p role="status" className="sr-only">
          {savedAt !== null ? `Enregistré à ${clock(savedAt)}.` : ""}
        </p>
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>

      <LinkDialog request={link} onClose={() => setLink(null)} onApply={applyLink} onRemove={removeLink} />
      <ImagePicker
        request={picker}
        media={[...library.values()]}
        asso={asso}
        canUpload={can.upload && !readOnly}
        onClose={() => setPicker(null)}
        onInsert={(attrs) => {
          setPicker(null);
          afterDialog((e) => e.chain().focus().insertPostImage(attrs).run());
        }}
        onChooseCover={(id) => {
          setPicker(null);
          edit(setCoverId)(id);
        }}
        onUploaded={(m) => setUploaded((list) => [m, ...list])}
      />
    </PostMediaContext.Provider>
  );
}

/** A section of the side column (a panel of its own on phones). */
function PanelSection({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cx("flex flex-col gap-4", className)}>
      <h2 id={id} className="border-b-2 border-fg pb-2 type-button text-[0.95rem]">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** "123 / 140", only near the limit. */
function Counter({ value, max, from, id }: { value: string; max: number; from: number; id: string }) {
  const near = value.length >= from;
  return (
    <span id={id} className={cx("type-meta tabular-nums", !near && "sr-only", value.length >= max ? "font-semibold text-warn" : "text-subtle")}>
      {value.length} / {max}
      <span className="sr-only"> caractères</span>
    </span>
  );
}

/** Why the last save failed, in words, and what to do (the text is never lost). */
function SaveErrorText({ code, message }: { code: string; message: string }) {
  if (code === "media_not_found") {
    return (
      <p>
        Une image du texte, ou la couverture, n&apos;est plus dans la médiathèque de l&apos;asso. Retire-la ou
        remplace-la (elle est signalée dans le texte)&nbsp;: l&apos;enregistrement reprend aussitôt.
      </p>
    );
  }
  return (
    <>
      <p>{message}</p>
      {code === "not_authenticated" && (
        <p className="mt-1">
          <a href={routes.login} target="_blank" rel="noopener" className="link font-semibold text-fg">
            Te reconnecter dans un nouvel onglet
          </a>
          , puis reviens ici et clique sur «&nbsp;Réessayer&nbsp;»&nbsp;: ton texte t&apos;attend.
        </p>
      )}
    </>
  );
}
