import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { chooseOption } from '@/test/select';
import { Checkbox } from './checkbox';
import { DatePicker } from './date-picker';
import { FilePicker } from './file-picker';
import { NumberInput } from './number-input';
import { RadioGroup, RadioOption } from './radio-group';
import { Select } from './select';

const OPTIONS = [
  { value: '', label: 'All' },
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Cherry', disabled: true },
];

function ControlledSelect({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <Select
      aria-label="Letter"
      value={value}
      options={OPTIONS}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('Select', () => {
  it('shows the selected label and picks an option with the mouse', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledSelect onChange={onChange} />);

    const trigger = screen.getByRole('combobox', { name: 'Letter' });
    expect(trigger).toHaveTextContent('All');
    await chooseOption(user, trigger, 'Beta');

    expect(onChange).toHaveBeenCalledWith('b');
    expect(trigger).toHaveTextContent('Beta');
  });

  it('opens with the keyboard, finds options by typing and keeps disabled ones out', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledSelect onChange={onChange} />);

    screen.getByRole('combobox').focus();
    await user.keyboard('{Enter}');
    expect(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Cherry' })).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('al{Enter}');

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('can be disabled and flags invalid state', () => {
    render(<Select aria-label="Letter" value="a" options={OPTIONS} onValueChange={() => {}} disabled invalid />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Checkbox and RadioGroup', () => {
  it('toggles the checkbox with the keyboard', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="Agree" onCheckedChange={onCheckedChange} />);

    screen.getByRole('checkbox', { name: 'Agree' }).focus();
    await user.keyboard(' ');

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('selects a radio by clicking its label and selects with the space key', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <RadioGroup aria-label="Pick" defaultValue="one" onValueChange={onValueChange}>
        <RadioOption value="one">One</RadioOption>
        <RadioOption value="two">Two</RadioOption>
        <RadioOption value="three" disabled>
          Three
        </RadioOption>
      </RadioGroup>,
    );

    await user.click(screen.getByText('Two'));
    expect(onValueChange).toHaveBeenLastCalledWith('two');
    expect(screen.getByRole('radio', { name: 'Two' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Three' })).toBeDisabled();

    screen.getByRole('radio', { name: 'Two' }).focus();
    await user.keyboard(' ');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    screen.getByRole('radio', { name: 'One' }).focus();
    await user.keyboard(' ');
    expect(onValueChange).toHaveBeenLastCalledWith('one');
  });
});

function ControlledDate({ min }: { min?: string }) {
  const [value, setValue] = useState('');
  return (
    <>
      <DatePicker id="when" value={value} min={min} onValueChange={setValue} />
      <output>{value}</output>
    </>
  );
}

describe('DatePicker', () => {
  it('picks a day from the calendar and writes it as yyyy-mm-dd', async () => {
    const user = userEvent.setup();
    render(<ControlledDate />);

    await user.click(screen.getByRole('button'));
    await user.click(within(screen.getByRole('gridcell', { name: '15' })).getByRole('button'));

    expect(screen.getByRole('status')).toHaveTextContent(/^\d{4}-\d{2}-15$/);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('does not offer days before the minimum', async () => {
    const user = userEvent.setup();
    render(<ControlledDate min="2099-06-10" />);

    await user.click(screen.getByRole('button'));

    const nav = screen.queryByRole('grid');
    expect(nav).toBeInTheDocument();
    expect(within(screen.getByRole('gridcell', { name: '9' })).getByRole('button')).toBeDisabled();
    expect(within(screen.getByRole('gridcell', { name: '10' })).getByRole('button')).toBeEnabled();
  });
});

describe('NumberInput', () => {
  function Harness() {
    const [value, setValue] = useState(5);
    return <NumberInput aria-describedby="x" min={0} max={7} value={value} onValueChange={setValue} />;
  }

  it('steps with the buttons and the arrow keys and clamps to the range', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole('spinbutton');

    await user.click(screen.getByRole('button', { name: /^(Increase|Aumentar)$/ }));
    await user.click(screen.getByRole('button', { name: /^(Increase|Aumentar)$/ }));
    expect(field).toHaveValue('7');
    expect(screen.getByRole('button', { name: /^(Increase|Aumentar)$/ })).toBeDisabled();

    await user.type(field, '{ArrowDown}');
    expect(field).toHaveValue('6');

    await user.clear(field);
    await user.type(field, '99');
    expect(field).toHaveValue('7');
  });
});

describe('FilePicker', () => {
  it('hands the chosen files to the callback', async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    render(<FilePicker label="Upload" accept="text/plain" onFiles={onFiles} />);
    const file = new File(['hi'], 'hi.txt', { type: 'text/plain' });

    await user.upload(screen.getByLabelText('Upload'), file);

    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('is disabled while busy', () => {
    render(<FilePicker label="Upload" accept="*/*" disabled loading onFiles={() => {}} />);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });
});
