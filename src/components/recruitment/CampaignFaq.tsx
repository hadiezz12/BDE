import { Icon } from "@/components/ui/Icon";

/**
 * Questions fréquentes as native disclosures: keyboard and screen readers
 * get expand/collapse for free, and every answer is in the HTML (searchable
 * with Ctrl F once opened).
 */
export function CampaignFaq({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div className="flex flex-col border-b border-line">
      {items.map((item) => (
        <details key={item.question} className="group border-t border-line first:border-t-0">
          <summary className="flex min-h-14 cursor-pointer list-none items-start justify-between gap-5 py-4 text-[1.05rem] font-bold leading-snug transition-colors hover:text-assoc-text [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
            <Icon
              name="plus"
              size={20}
              className="mt-0.5 shrink-0 transition-transform duration-200 group-open:rotate-45"
            />
          </summary>
          <p className="max-w-2xl pb-6 text-muted">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
