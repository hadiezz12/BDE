"use client";

import type { ProfileErrors, ProfileInput } from "@/lib/auth/profile-input";
import { NAME_MAX, PROGRAM_MAX, STUDY_YEARS, studyYearLabel } from "@/lib/auth/profile-input";
import { Field, Input, Select } from "@/components/ui/Field";

/**
 * The profile fields, shared by the first-visit form and the profile page.
 * Name is required; the rest is optional. Nothing else is asked: no birth
 * date, phone or social handles (a recruitment can ask what it needs later).
 * Values are rendered as text by React, never as HTML.
 */
export function ProfileFields({
  values,
  errors = {},
}: {
  values: Partial<ProfileInput>;
  errors?: ProfileErrors;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Field label="Prénom" error={errors.firstName}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="firstName"
            required
            maxLength={NAME_MAX}
            autoComplete="given-name"
            defaultValue={values.firstName ?? ""}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field label="Nom" error={errors.lastName}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="lastName"
            required
            maxLength={NAME_MAX}
            autoComplete="family-name"
            defaultValue={values.lastName ?? ""}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field
        label="Nom affiché"
        optional
        hint="Si tu préfères qu'on t'appelle autrement que par ton prénom."
        error={errors.displayName}
        className="sm:col-span-2"
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="displayName"
            maxLength={NAME_MAX}
            autoComplete="nickname"
            defaultValue={values.displayName ?? ""}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field label="Programme" optional hint="Tel qu'il s'appelle à l'école." error={errors.program}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="program"
            maxLength={PROGRAM_MAX}
            autoComplete="off"
            defaultValue={values.program ?? ""}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field label="Année" optional error={errors.studyYear}>
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            name="studyYear"
            defaultValue={values.studyYear ? String(values.studyYear) : ""}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            <option value="">Je préfère ne pas le dire</option>
            {STUDY_YEARS.map((year) => (
              <option key={year} value={year}>
                {studyYearLabel(year)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}
