import { zodResolver } from '@hookform/resolvers/zod';
import type { Grant } from '@opencourse/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAdminGrantMutations } from '@/hooks/adminQueries';
import {
  extendGrantSchema,
  toExpiryIso,
  tomorrowInputValue,
  type ExtendGrantValues,
} from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';

/** Sets a new expiry (or lifetime) for a grant. Mounted per grant (keyed at the call site). */
export function ExtendGrantDialog({
  grant,
  userName,
  onClose,
}: {
  grant: Grant;
  userName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { extend } = useAdminGrantMutations();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ExtendGrantValues>({
    resolver: zodResolver(extendGrantSchema),
    defaultValues: { access: 'lifetime', expiresOn: '' },
  });
  const access = useWatch({ control, name: 'access' });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await extend.mutateAsync({ grantId: grant.id, expiresAt: toExpiryIso(values) });
      toast.success(t('admin:grants.extend.successToast', { name: userName }));
      onClose();
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('admin:grants.extend.title')}</DialogTitle>
        <DialogDescription>
          {t('admin:grants.extend.description', { name: userName })}
        </DialogDescription>
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <FormError message={formError} />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('admin:grants.extend.access')}</legend>
            {(['lifetime', 'until'] as const).map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  value={value}
                  className="size-4 accent-primary"
                  {...register('access')}
                />
                {t(`admin:grants.extend.accessOption.${value}`)}
              </label>
            ))}
          </fieldset>
          {access === 'until' ? (
            <TextField
              type="date"
              label={t('admin:grants.extend.expiresOn')}
              min={tomorrowInputValue()}
              error={errors.expiresOn}
              {...register('expiresOn')}
            />
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={extend.isPending}>
              {extend.isPending ? <Spinner /> : null}
              {t('admin:grants.extend.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
