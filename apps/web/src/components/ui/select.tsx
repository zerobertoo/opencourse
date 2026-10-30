import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { fieldClassName } from './input';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Radix rejects empty item values, so the "no filter" option travels under this stand-in. */
const EMPTY_VALUE = '__empty__';

const toRadixValue = (value: string, options: SelectOption[]) =>
  value === '' && options.some((option) => option.value === '') ? EMPTY_VALUE : value;
const fromRadixValue = (value: string) => (value === EMPTY_VALUE ? '' : value);

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Mirrors `aria-invalid` and paints the destructive border. */
  invalid?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  onBlur?: () => void;
}

/**
 * Select with the same look and keyboard behaviour in every browser: arrows, Home/End and
 * type-ahead. The value is controlled; an empty string is a valid option value.
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    { options, value, onValueChange, placeholder, invalid, className, onBlur, ...triggerProps },
    ref,
  ) => (
    <SelectPrimitive.Root
      value={toRadixValue(value, options)}
      onValueChange={(next) => onValueChange(fromRadixValue(next))}
      disabled={triggerProps.disabled}
      name={triggerProps.name}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        aria-invalid={invalid ? true : undefined}
        onBlur={onBlur}
        className={cn(
          fieldClassName,
          'inline-flex h-10 items-center justify-between gap-2 text-start data-[placeholder]:text-muted-foreground',
          className,
        )}
        id={triggerProps.id}
        aria-label={triggerProps['aria-label']}
        aria-describedby={triggerProps['aria-describedby']}
      >
        <span className="min-w-0 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[60] max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border bg-surface text-surface-foreground shadow-md"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={toRadixValue(option.value, options)}
                disabled={option.disabled}
                className="relative flex min-h-10 cursor-pointer select-none items-center rounded-sm ps-8 pe-3 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[disabled]:opacity-60"
              >
                <SelectPrimitive.ItemIndicator className="absolute start-2">
                  <Check className="size-4" aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  ),
);
Select.displayName = 'Select';
