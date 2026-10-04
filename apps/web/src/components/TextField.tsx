import type { ParseKeys } from 'i18next';
import { forwardRef, useId } from 'react';
import type { FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Validation error from react-hook-form; its message is an i18n key. */
  error?: FieldError;
  hint?: string;
}

/** Labelled input with inline validation message, wired for screen readers. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, hint, id, ...inputProps }, ref) => {
    const { t } = useTranslation();
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const messageId = `${fieldId}-message`;

    return (
      <div className="space-y-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium">
          {label}
        </label>
        <Input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          {...inputProps}
        />
        {error?.message ? (
          <p id={messageId} role="alert" className="text-sm text-destructive">
            {t(error.message as ParseKeys)}
          </p>
        ) : hint ? (
          <p id={messageId} className="text-sm text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
TextField.displayName = 'TextField';
