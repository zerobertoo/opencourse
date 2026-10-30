import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Opens a select and picks the option shown with the given text, like a user would. */
export async function chooseOption(user: UserEvent, trigger: HTMLElement, optionName: string) {
  await user.click(trigger);
  await user.click(
    await within(await screen.findByRole('listbox')).findByRole('option', { name: optionName }),
  );
}
