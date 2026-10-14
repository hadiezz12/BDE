import type { AccentKey, PostKind } from "@/lib/types";
import { cx } from "@/lib/cx";

/**
 * Long-form reading: ~18px, generous leading, a 40rem measure and a sticker-
 * printed pink drop cap. Two structures are recognised in the copy itself:
 *  - interviews: « Question ? « Réponse… » » → question set as a subhead,
 *    answer as a quote ruled in the association's colour;
 *  - announcements written as FAQ: « Question ? Réponse… » → question as a
 *    subhead, answer as a normal paragraph.
 */
type Block =
  | { type: "text"; text: string }
  | { type: "qa"; question: string; answer: string; quoted: boolean };

const INTERVIEW_QA = /^(.{3,220}?\?)\s+(«[\s\S]+)$/;
const FAQ_QA = /^([^.!?«»]{3,110}\?)\s+([\s\S]+)$/;

function toBlocks(paragraphs: string[], kind: PostKind): Block[] {
  return paragraphs.map((text) => {
    const interview = kind === "interview" ? text.match(INTERVIEW_QA) : null;
    if (interview) return { type: "qa", question: interview[1], answer: interview[2], quoted: true };
    const faq = kind === "annonce" ? text.match(FAQ_QA) : null;
    if (faq) return { type: "qa", question: faq[1], answer: faq[2], quoted: false };
    return { type: "text", text };
  });
}

const DROP_CAP =
  "first-letter:float-left first-letter:mr-3 first-letter:mt-[0.06em] first-letter:text-[4.4em] first-letter:leading-[0.8] " +
  "first-letter:font-black first-letter:[font-stretch:70%] first-letter:text-accent first-letter:[text-shadow:3px_3px_0_var(--fg)]";

export function ArticleBody({
  paragraphs,
  kind,
  accent = "rose",
  className,
}: {
  paragraphs: string[];
  kind: PostKind;
  /** Colours the interview answer rule. */
  accent?: AccentKey;
  className?: string;
}) {
  const blocks = toBlocks(paragraphs, kind);
  return (
    <div
      data-accent={accent}
      className={cx("flex max-w-[40rem] flex-col gap-6 text-[1.125rem] leading-[1.75]", className)}
    >
      {blocks.map((b, i) => {
        if (b.type === "text") {
          return (
            <p key={i} className={cx(i === 0 && DROP_CAP)}>
              {b.text}
            </p>
          );
        }
        return (
          <div key={i} className={cx("flex flex-col gap-3", i > 0 && "mt-2")}>
            <h2 className="text-[1.2rem] font-extrabold leading-snug [font-stretch:96%]">{b.question}</h2>
            <p className={cx(b.quoted && "border-l-4 border-assoc pl-5")}>{b.answer}</p>
          </div>
        );
      })}
    </div>
  );
}
