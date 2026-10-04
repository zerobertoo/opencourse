import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, SelectField } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAssignableStudents, useGrantMutations } from '@/hooks/studioQueries';
import {
  INVITE_VALIDITY_DAYS,
  grantAccessSchema,
  inviteStudentSchema,
  toExpiryIso,
  type GrantAccessValues,
  type InviteStudentValues,
} from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';
import type { CourseStudent } from '@/services';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tomorrow as `YYYY-MM-DD`, the earliest expiry the date input offers. */
function tomorrowInputValue(): string {
  const tomorrow = new Date(Date.now() + DAY_MS);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
}

/** ISO date `days` days from now. */
function inviteExpiry(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

/** Grants manual access to a student, for a period or for life. */
export function GrantAccessDialog({
  courseId,
  students,
  open,
  onOpenChange,
}: {
  courseId: string;
  /** Students who already have a row in the course; those with active access are not offered. */
  students: CourseStudent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(['studio', 'common']);
  const candidates = useAssignableStudents(open);
  const { createGrant } = useGrantMutations(courseId);
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<GrantAccessValues>({
    resolver: zodResolver(grantAccessSchema),
    defaultValues: { userId: '', access: 'lifetime', expiresOn: '' },
  });

  const access = useWatch({ control, name: 'access' });
  const alreadyActive = new Set(
    students.filter((entry) => entry.grant.status === 'active').map((entry) => entry.user.id),
  );
  const available = (candidates.data ?? []).filter((user) => !alreadyActive.has(user.id));

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setFormError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createGrant.mutateAsync({
        userId: values.userId,
        courseId,
        expiresAt: toExpiryIso(values),
      });
      toast.success(t('studio:students.grant.successToast'));
      close(false);
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('studio:students.grant.title')}</DialogTitle>
        <DialogDescription>{t('studio:students.grant.description')}</DialogDescription>
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <FormError message={formError} />
          <SelectField
            label={t('studio:students.grant.student')}
            error={errors.userId}
            disabled={candidates.isPending}
            {...register('userId')}
          >
            <option value="">{t('studio:students.grant.studentPlaceholder')}</option>
            {available.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </SelectField>
          {candidates.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t('studio:students.grant.loadError')}
            </p>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('studio:students.grant.access')}</legend>
            {(['lifetime', 'until'] as const).map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  value={value}
                  className="size-4 accent-primary"
                  {...register('access')}
                />
                {t(`studio:students.grant.accessOption.${value}`)}
              </label>
            ))}
          </fieldset>
          {access === 'until' ? (
            <TextField
              type="date"
              label={t('studio:students.grant.expiresOn')}
              min={tomorrowInputValue()}
              error={errors.expiresOn}
              {...register('expiresOn')}
            />
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={createGrant.isPending}>
              {createGrant.isPending ? <Spinner /> : null}
              {t('studio:students.grant.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Creates an invite and then shows its link: the mock sends no e-mail, so it is shared by hand. */
export function InviteDialog({
  courseId,
  open,
  onOpenChange,
}: {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(['studio', 'common']);
  const { createInvite } = useGrantMutations(courseId);
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteStudentValues>({
    resolver: zodResolver(inviteStudentSchema),
    defaultValues: { email: '', validityDays: '14' },
  });

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setFormError(null);
      setInviteLink(null);
      setCopied(false);
    }
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const invite = await createInvite.mutateAsync({
        email: values.email,
        courseId,
        expiresAt: inviteExpiry(Number(values.validityDays)),
      });
      setInviteLink(`${window.location.origin}/invite/${invite.token}`);
      toast.success(t('studio:students.invite.successToast'));
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      toast.error(t('studio:students.invite.copyFailed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('studio:students.invite.title')}</DialogTitle>
        <DialogDescription>{t('studio:students.invite.description')}</DialogDescription>
        {inviteLink ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm">{t('studio:students.invite.linkReady')}</p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={inviteLink}
                aria-label={t('studio:students.invite.linkLabel')}
                className="font-mono text-xs"
                onFocus={(event) => event.target.select()}
              />
              <Button variant="outline" onClick={() => void copyLink()}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? t('studio:students.invite.copied') : t('studio:students.invite.copy')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('studio:students.invite.mockNote')}</p>
            <div className="flex justify-end">
              <Button onClick={() => close(false)}>{t('studio:students.invite.done')}</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
            <FormError message={formError} />
            <TextField
              type="email"
              autoComplete="off"
              label={t('studio:students.invite.email')}
              error={errors.email}
              {...register('email')}
            />
            <SelectField
              label={t('studio:students.invite.validity')}
              error={errors.validityDays}
              {...register('validityDays')}
            >
              {INVITE_VALIDITY_DAYS.map((days) => (
                <option key={days} value={days}>
                  {t('studio:students.invite.validityOption', { count: Number(days) })}
                </option>
              ))}
            </SelectField>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => close(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={createInvite.isPending}>
                {createInvite.isPending ? <Spinner /> : null}
                {t('studio:students.invite.submit')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
