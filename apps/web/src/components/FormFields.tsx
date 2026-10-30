import type { ParseKeys } from 'i18next';
import { forwardRef, useId } from 'react';
import {
  useController,
  type Control,
  type FieldError,
  type FieldValues,
  type Path,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker, type DatePickerProps } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/input';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { Select, type SelectProps } from '@/components/ui/select';
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
export function FieldFrame({ label, error, hint, fieldId, children, className }: FieldFrameProps) {
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

interface SelectFieldProps extends Omit<SelectProps, 'invalid' | 'aria-describedby'> {
  label: string;
  error?: FieldError;
  hint?: string;
}

/** Labelled select with inline validation message. */
export function SelectField({
  label,
  error,
  hint,
  id,
  className,
  ...selectProps
}: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame label={label} error={error} hint={hint} fieldId={fieldId} className={className}>
      <Select
        id={fieldId}
        invalid={error !== undefined}
        aria-describedby={error || hint ? `${fieldId}-message` : undefined}
        {...selectProps}
      />
    </FieldFrame>
  );
}

interface FormBinding<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
}

/** `SelectField` bound to a react-hook-form field; the error comes from the form state. */
export function FormSelectField<T extends FieldValues>({
  control,
  name,
  ...props
}: FormBinding<T> & Omit<SelectFieldProps, 'value' | 'onValueChange' | 'error' | 'name'>) {
  const { field, fieldState } = useController({ control, name });
  return (
    <SelectField
      {...props}
      name={field.name}
      value={field.value ?? ''}
      onValueChange={field.onChange}
      onBlur={field.onBlur}
      error={fieldState.error}
    />
  );
}

/** Labelled date picker with inline validation message, bound to a react-hook-form field. */
export function FormDateField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  ...props
}: FormBinding<T> &
  Omit<DatePickerProps, 'value' | 'onValueChange' | 'invalid'> & { label: string; hint?: string }) {
  const generatedId = useId();
  const fieldId = props.id ?? generatedId;
  const { field, fieldState } = useController({ control, name });
  return (
    <FieldFrame label={label} error={fieldState.error} hint={hint} fieldId={fieldId}>
      <DatePicker
        {...props}
        id={fieldId}
        name={field.name}
        value={field.value ?? ''}
        onValueChange={field.onChange}
        onBlur={field.onBlur}
        invalid={fieldState.error !== undefined}
        aria-describedby={fieldState.error || hint ? `${fieldId}-message` : undefined}
      />
    </FieldFrame>
  );
}

/** Group of radios with a legend, bound to a react-hook-form field. */
export function FormRadioGroupField<T extends FieldValues>({
  control,
  name,
  legend,
  options,
}: FormBinding<T> & { legend: string; options: Array<{ value: string; label: string }> }) {
  const { field } = useController({ control, name });
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <RadioGroup
        value={field.value ?? ''}
        onValueChange={field.onChange}
        onBlur={field.onBlur}
        name={field.name}
        className="gap-0"
      >
        {options.map((option) => (
          <RadioOption key={option.value} value={option.value}>
            {option.label}
          </RadioOption>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

interface CheckboxFieldProps {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

/** Checkbox with a label and optional explanation; the whole row toggles it. */
export function CheckboxField({
  label,
  hint,
  id,
  checked,
  onCheckedChange,
  disabled,
}: CheckboxFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className="flex items-start gap-3">
      <label htmlFor={fieldId} className="flex min-h-11 cursor-pointer items-start gap-3">
        <Checkbox
          id={fieldId}
          checked={checked}
          onCheckedChange={(next) => onCheckedChange(next === true)}
          disabled={disabled}
          aria-labelledby={`${fieldId}-label`}
          aria-describedby={hint ? `${fieldId}-hint` : undefined}
          className="mt-3"
        />
        <span className="space-y-0.5 py-2.5">
          <span id={`${fieldId}-label`} className="block text-sm font-medium">
            {label}
          </span>
          {hint ? (
            <span id={`${fieldId}-hint`} className="block text-sm text-muted-foreground">
              {hint}
            </span>
          ) : null}
        </span>
      </label>
    </div>
  );
}

/**
 * `CheckboxField` bound to a react-hook-form field. With `value` the field holds an array and the
 * box toggles that value in it; without, the field holds a boolean.
 */
export function FormCheckboxField<T extends FieldValues>({
  control,
  name,
  value,
  ...props
}: FormBinding<T> & { label: string; hint?: string; value?: string }) {
  const { field } = useController({ control, name });
  const list: string[] = Array.isArray(field.value) ? field.value : [];
  return (
    <CheckboxField
      {...props}
      checked={value === undefined ? field.value === true : list.includes(value)}
      onCheckedChange={(checked) =>
        field.onChange(
          value === undefined
            ? checked
            : checked
              ? [...list, value]
              : list.filter((item) => item !== value),
        )
      }
    />
  );
}

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
