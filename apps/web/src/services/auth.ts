import type { Invite, Role, User } from '@opencourse/shared';

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

export interface AcceptInviteInput {
  name: string;
  password: string;
}

export interface AuthService {
  /** User of the current session, or null if nobody is authenticated. */
  getCurrentUser(): Promise<User | null>;
  /** Signs in with e-mail and password. */
  signIn(email: string, password: string): Promise<User>;
  /** Testing shortcut: signs in as the demo user of the given role. */
  signInAs(role: Role): Promise<User>;
  signUp(input: SignUpInput): Promise<User>;
  signOut(): Promise<void>;
  /** Changes the authenticated user's password. Throws `validation` if the current password is empty. */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  /** Always completes without revealing whether the e-mail exists. */
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  /** Looks up a pending invite to show on the acceptance screen. */
  getInvite(token: string): Promise<Invite>;
  /** Creates the account from the invite, grants the course (if any) and starts the session. */
  acceptInvite(token: string, input: AcceptInviteInput): Promise<User>;
}
