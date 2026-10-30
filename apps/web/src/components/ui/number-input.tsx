import { Minus, Plus } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';

export interface NumberInputProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  'aria-describedby'?: string;
}

/**
 * Integer field with minus/plus buttons, so the steppers look the same everywhere instead of
 * the browser's own spin arrows. Typed values are clamped to `min`/`max` on every change.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onValueChange,
      min = -Infinity,
      max = Infinity,
      step = 1,
      invalid,
      className,
      ...rest
    },
    ref,
  ) => {
    const { t } = useTranslation();
    // text being typed; it only follows `value` again when the field loses focus
    const [draft, setDraft] = useState<string | null>(null);
    const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
    const commit = (next: number) => {
      setDraft(null);
      onValueChange(clamp(next));
    };
    const disabled = rest.disabled;

    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('numberInput.decrease')}
          disabled={disabled || value <= min}
          tabIndex={-1}
          onClick={() => commit(value - step)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <Input
          ref={ref}
          type="text"
          role="spinbutton"
          inputMode="numeric"
          aria-valuenow={value}
          aria-valuemin={Number.isFinite(min) ? min : undefined}
          aria-valuemax={Number.isFinite(max) ? max : undefined}
          aria-invalid={invalid ? true : undefined}
          className="min-w-0 text-center tabular-nums"
          value={draft ?? value}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            if (/^-?\d+$/.test(text)) onValueChange(clamp(Number(text)));
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              commit(value + (event.key === 'ArrowUp' ? step : -step));
            }
          }}
          {...rest}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label={t('numberInput.increase')}
          disabled={disabled || value >= max}
          tabIndex={-1}
          onClick={() => commit(value + step)}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
    );
  },
);
NumberInput.displayName = 'NumberInput';
