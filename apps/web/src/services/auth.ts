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
  /** Usuário da sessão atual, ou nulo se ninguém estiver autenticado. */
  getCurrentUser(): Promise<User | null>;
  /** Entra com e-mail e senha. */
  signIn(email: string, password: string): Promise<User>;
  /** Atalho de teste: entra como o usuário de demonstração do papel informado. */
  signInAs(role: Role): Promise<User>;
  signUp(input: SignUpInput): Promise<User>;
  signOut(): Promise<void>;
  /** Sempre conclui sem revelar se o e-mail existe. */
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  /** Consulta um convite pendente para exibir na tela de aceite. */
  getInvite(token: string): Promise<Invite>;
  /** Cria a conta a partir do convite, concede o curso (se houver) e inicia a sessão. */
  acceptInvite(token: string, input: AcceptInviteInput): Promise<User>;
}
