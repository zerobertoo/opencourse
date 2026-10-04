import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, SelectField } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useUserMutations } from '@/hooks/adminQueries';
import {
  INVITE_VALIDITY_DAYS,
  daysFromNowIso,
  inviteUserSchema,
  type InviteUserValues,
} from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';

/** Invites someone to the platform (no course) and then shows the link to share by hand. */
export function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { invite } = useUserMutations();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteUserValues>({
    resolver: zodResolver(inviteUserSchema),
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
      const created = await invite.mutateAsync({
        email: values.email,
        expiresAt: daysFromNowIso(Number(values.validityDays)),
      });
      setInviteLink(`${window.location.origin}/invite/${created.token}`);
      toast.success(t('admin:users.invite.successToast'));
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
      toast.error(t('admin:users.invite.copyFailed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('admin:users.invite.title')}</DialogTitle>
        <DialogDescription>{t('admin:users.invite.description')}</DialogDescription>
        {inviteLink ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm">{t('admin:users.invite.linkReady')}</p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={inviteLink}
                aria-label={t('admin:users.invite.linkLabel')}
                className="text-xs"
                onFocus={(event) => event.target.select()}
              />
              <Button variant="outline" onClick={() => void copyLink()}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? t('admin:users.invite.copied') : t('admin:users.invite.copy')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('admin:users.invite.mockNote')}</p>
            <div className="flex justify-end">
              <Button onClick={() => close(false)}>{t('admin:users.invite.done')}</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
            <FormError message={formError} />
            <TextField
              type="email"
              autoComplete="off"
              label={t('admin:users.invite.email')}
              error={errors.email}
              {...register('email')}
            />
            <SelectField
              label={t('admin:users.invite.validity')}
              error={errors.validityDays}
              {...register('validityDays')}
            >
              {INVITE_VALIDITY_DAYS.map((days) => (
                <option key={days} value={days}>
                  {t('admin:users.invite.validityOption', { count: Number(days) })}
                </option>
              ))}
            </SelectField>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => close(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? <Spinner /> : null}
                {t('admin:users.invite.submit')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
