import type { Locale } from '@opencourse/shared';
import type { Mail } from './mailer';

type Template = Omit<Mail, 'to'>;

/** Password recovery e-mail, in the language of the account. */
export function passwordResetEmail(locale: Locale, link: string): Template {
  if (locale === 'en') {
    return {
      subject: 'Reset your OpenCourse password',
      text: `Someone asked to reset the password of your OpenCourse account.\n\nChoose a new password here (the link works for 1 hour):\n${link}\n\nIf it was not you, ignore this e-mail: your password stays the same.`,
    };
  }
  return {
    subject: 'Redefina sua senha do OpenCourse',
    text: `Alguém pediu para redefinir a senha da sua conta no OpenCourse.\n\nEscolha uma nova senha aqui (o link vale por 1 hora):\n${link}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`,
  };
}

/** Tells a student their certificate is ready, in the language of the account. */
export function certificateEmail(
  locale: Locale,
  name: string,
  courseTitle: string,
  link: string,
): Template {
  if (locale === 'en') {
    return {
      subject: `Your certificate for ${courseTitle} is ready`,
      text: `Congratulations, ${name}! You completed "${courseTitle}".\n\nDownload your certificate here:\n${link}`,
    };
  }
  return {
    subject: `Seu certificado de ${courseTitle} está pronto`,
    text: `Parabéns, ${name}! Você concluiu "${courseTitle}".\n\nBaixe seu certificado aqui:\n${link}`,
  };
}

/** Invitation e-mail. The invitee has no account yet, so the language is the platform default. */
export function inviteEmail(locale: Locale, inviterName: string, link: string): Template {
  if (locale === 'en') {
    return {
      subject: `${inviterName} invited you to OpenCourse`,
      text: `${inviterName} invited you to join OpenCourse.\n\nCreate your account here:\n${link}\n\nIf you were not expecting this, you can ignore this e-mail.`,
    };
  }
  return {
    subject: `${inviterName} convidou você para o OpenCourse`,
    text: `${inviterName} convidou você para participar do OpenCourse.\n\nCrie sua conta aqui:\n${link}\n\nSe você não esperava este convite, pode ignorar este e-mail.`,
  };
}
