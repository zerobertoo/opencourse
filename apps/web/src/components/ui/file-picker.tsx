import { Upload, type LucideIcon } from 'lucide-react';
import { useId, useRef } from 'react';
import { Spinner } from '@/components/Spinner';
import { Button, type ButtonProps } from './button';

interface FilePickerProps extends Omit<ButtonProps, 'onClick' | 'type'> {
  /** Accessible name of the hidden file input and visible text of the button. */
  label: string;
  accept: string;
  multiple?: boolean;
  /** Leading icon, hidden while `loading`. */
  icon?: LucideIcon;
  loading?: boolean;
  onFiles: (files: File[]) => void;
}

/**
 * Button that opens the system file chooser. The native input stays invisible, so the only thing
 * the user sees is the same button in every browser.
 */
export function FilePicker({
  label,
  accept,
  multiple,
  onFiles,
  icon: Icon = Upload,
  loading,
  children,
  variant = 'outline',
  ...buttonProps
}: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  return (
    <>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          // lets the same file be picked again
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant={variant}
        onClick={() => inputRef.current?.click()}
        {...buttonProps}
      >
        {loading ? <Spinner /> : <Icon aria-hidden="true" />}
        {label}
        {children}
      </Button>
    </>
  );
}
