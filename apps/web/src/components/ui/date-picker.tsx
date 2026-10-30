import * as PopoverPrimitive from '@radix-ui/react-popover';
import { CalendarDays } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { enUS, ptBR } from 'react-day-picker/locale';
import { useTranslation } from 'react-i18next';
import { createFormatters } from '@/lib/intl';
import { cn } from '@/lib/utils';
import { fieldClassName } from './input';

/** Parses `yyyy-mm-dd` as a local calendar day (no time zone shift). */
function parseDay(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDay(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface DatePickerProps {
  /** `yyyy-mm-dd`, or an empty string when nothing is picked. */
  value: string;
  onValueChange: (value: string) => void;
  /** Earliest selectable day, `yyyy-mm-dd`. */
  min?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  'aria-describedby'?: string;
  onBlur?: () => void;
}

const dayCellClassName =
  'size-11 rounded-md text-sm hover:bg-muted sm:size-10 disabled:pointer-events-none';

/**
 * Date field with an in-page calendar, so iOS, Android, Firefox and Chrome all look and behave
 * the same. Follows the interface language; the value stays a plain `yyyy-mm-dd` string.
 */
export const DatePicker = forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    { value, onValueChange, min, placeholder, invalid, className, onBlur, ...triggerProps },
    ref,
  ) => {
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const selected = parseDay(value);
    const minDay = min ? parseDay(min) : undefined;

    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger
          ref={ref}
          type="button"
          aria-invalid={invalid ? true : undefined}
          onBlur={onBlur}
          className={cn(
            fieldClassName,
            'inline-flex h-10 items-center justify-between gap-2 text-start',
            !selected && 'text-muted-foreground',
            className,
          )}
          {...triggerProps}
        >
          <span className="min-w-0 truncate">
            {selected
              ? createFormatters(i18n.language).formatDate(selected)
              : (placeholder ?? t('datePicker.placeholder'))}
          </span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            className="z-[60] rounded-md border bg-surface p-2 text-surface-foreground shadow-md"
          >
            <DayPicker
              mode="single"
              required={false}
              selected={selected}
              defaultMonth={selected ?? minDay}
              disabled={minDay ? { before: minDay } : undefined}
              labels={{
                labelNext: () => t('datePicker.nextMonth'),
                labelPrevious: () => t('datePicker.previousMonth'),
              }}
              locale={i18n.language.startsWith('pt') ? ptBR : enUS}
              onSelect={(day) => {
                if (!day) return;
                onValueChange(formatDay(day));
                setOpen(false);
              }}
              classNames={{
                months: 'relative',
                month_caption: 'flex h-10 items-center justify-center text-sm font-medium',
                nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
                button_previous: 'grid size-10 place-items-center rounded-md hover:bg-muted',
                button_next: 'grid size-10 place-items-center rounded-md hover:bg-muted',
                chevron: 'size-4 fill-current rtl:rotate-180',
                month_grid: 'border-collapse',
                weekday: 'size-11 text-xs font-normal text-muted-foreground sm:size-10',
                day: 'p-0 text-center',
                day_button: dayCellClassName,
                selected: '[&>button]:bg-primary [&>button]:text-primary-foreground',
                today: '[&>button]:border [&>button]:font-semibold',
                disabled: 'opacity-40',
                outside: 'text-muted-foreground',
              }}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  },
);
DatePicker.displayName = 'DatePicker';
