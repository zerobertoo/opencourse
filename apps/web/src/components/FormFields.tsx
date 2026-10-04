import type { ParseKeys } from 'i18next';
import { forwardRef, useId } from 'react';
import type { FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FieldFrameProps {
  label: string;
  /** Validation error from react-hook-form; its message is an i18n key. */
  error?: FieldError;
  hint?: string;
  fieldId: string;
  children: React.ReactNode;
  className?: string;
}

/** Label, control slot and the inline message shared by the fields below. */
function FieldFrame({ label, error, hint, fieldId, children, className }: FieldFrameProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={fieldId} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error?.message ? (
        <p id={`${fieldId}-message`} role="alert" className="text-sm text-destructive">
          {t(error.message as ParseKeys)}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-message`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface TextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: FieldError;
  hint?: string;
}

/** Labelled textarea with inline validation message. */
export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  ({ label, error, hint, id, className, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldFrame label={label} error={error} hint={hint} fieldId={fieldId}>
        <Textarea
          ref={ref}
          id={fieldId}
          className={className}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-message` : undefined}
          {...props}
        />
      </FieldFrame>
    );
  },
);
TextAreaField.displayName = 'TextAreaField';

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: FieldError;
  hint?: string;
}

/** Labelled native select with inline validation message. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, hint, id, children, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldFrame label={label} error={error} hint={hint} fieldId={fieldId}>
        <Select
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-message` : undefined}
          {...props}
        >
          {children}
        </Select>
      </FieldFrame>
    );
  },
);
SelectField.displayName = 'SelectField';

interface CheckboxFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  hint?: string;
}

/** Checkbox with a label and optional explanation. */
export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(
  ({ label, hint, id, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <div className="flex items-start gap-3">
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          aria-describedby={hint ? `${fieldId}-hint` : undefined}
          className="mt-1 size-4 shrink-0 accent-primary"
          {...props}
        />
        <div className="space-y-0.5">
          <label htmlFor={fieldId} className="text-sm font-medium">
            {label}
          </label>
          {hint ? (
            <p id={`${fieldId}-hint`} className="text-sm text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    );
  },
);
CheckboxField.displayName = 'CheckboxField';

/** Error banner shown above a form when the service call fails. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
    >
      {message}
    </p>
  );
}
