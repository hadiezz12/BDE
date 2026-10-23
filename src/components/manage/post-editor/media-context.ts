"use client";

import { createContext, useContext } from "react";
import type { LibraryImage } from "@/lib/posts/editor";

export interface ImageAttrs {
  mediaId: string;
  alt: string | null;
  caption: string | null;
}

/**
 * What the image blocks inside the text need from the editor around them:
 * the association's library (to show the image itself), whether the text
 * can be changed, and the way to open the description dialog. Node views
 * render inside EditorContent, so they read it as ordinary React context.
 */
export interface PostMediaContextValue {
  media: Map<string, LibraryImage>;
  editable: boolean;
  /** Opens the description and caption of one image; `apply` writes them back into the text. */
  editImage: (attrs: ImageAttrs, apply: (next: ImageAttrs) => void) => void;
}

export const PostMediaContext = createContext<PostMediaContextValue>({
  media: new Map(),
  editable: false,
  editImage: () => {},
});

export const usePostMedia = () => useContext(PostMediaContext);
