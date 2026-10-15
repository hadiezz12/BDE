import { useId, type ComponentProps, type ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Form primitives. A Field always renders a real <label>, wires hint and
 * error text through aria-describedby, and marks optional fields in words
 * (the maquette's "(facultatif)") rather than starring required ones.
 */

const control =
  "w-full rounded-sm border bg-raised px-3.5 text-fg placeholder:text-subtle " +
  "border-line-strong/70 transition-[border-color,box-shadow] duration-150 " +
  "hover:border-fg/60 focus-visible:outline-none focus-visible:border-fg focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus)_35%,transparent)] " +
  "aria-[invalid=true]:border-danger disabled:opacity-50";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  /** Receives the generated id and describedby to spread on the control. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-[0.95rem] font-bold leading-snug">
        {label}
        {optional && <span className="ml-1.5 font-normal text-subtle">(facultatif)</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <p id={hintId} className="type-small text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="type-small font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(control, "min-h-12 py-2.5", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx(control, "min-h-32 py-3 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cx(control, "min-h-12 appearance-none py-2.5 pr-10", className)} {...rest}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="m6 9.5 6 6 6-6" />
      </svg>
    </div>
  );
}

/** Checkbox with its label as one large touch target. */
export function Checkbox({
  label,
  description,
  className,
  ...rest
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3 py-1", className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-xs border-2 border-line-strong accent-accent"
        {...rest}
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold leading-snug">{label}</span>
        {description && <span className="type-small text-muted">{description}</span>}
      </span>
    </label>
  );
}

/**
 * Large choice tiles (the maquette's "Nature de l'alerte" grid), built on
 * real radio inputs so keyboard and screen readers work natively.
 */
export function ChoiceGroup({
  legend,
  name,
  options,
  defaultValue,
  columns = 2,
  describedBy,
}: {
  legend: ReactNode;
  name: string;
  options: { value: string; label: string; description?: string }[];
  defaultValue?: string;
  columns?: 1 | 2;
  /** Id(s) of a hint or error rendered outside the group (announced on entering it). */
  describedBy?: string;
}) {
  return (
    <fieldset aria-describedby={describedBy} className="flex flex-col gap-3">
      <legend className="mb-1 text-[0.95rem] font-bold">{legend}</legend>
      <div className={cx("grid gap-2.5", columns === 2 && "sm:grid-cols-2")}>
        {options.map((o) => (
          <label
            key={o.value}
            className="focus-ring-within group relative flex cursor-pointer flex-col gap-1 rounded-sm border-2 border-line bg-raised px-4 py-3.5 transition-colors hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent/8"
          >
            <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} className="sr-only" />
            <span className="type-button text-[0.8rem] text-muted group-has-[:checked]:text-fg">{o.label}</span>
            {o.description && <span className="type-small text-subtle">{o.description}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
