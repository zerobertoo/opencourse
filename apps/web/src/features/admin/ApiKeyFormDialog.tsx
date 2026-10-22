import { zodResolver } from '@hookform/resolvers/zod';
import type { ApiKeyWithToken } from '@opencourse/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useApiKeyMutations } from '@/hooks/adminQueries';
import { apiKeyFormSchema, type ApiKeyFormValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';

/** Creates an API key and hands the one-time token back. */
export function ApiKeyFormDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: ApiKeyWithToken) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { create } = useApiKeyMutations();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: { name: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await create.mutateAsync(values);
      toast.success(t('admin:apiKeys.form.createdToast'));
      onCreated(created);
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('admin:apiKeys.form.title')}</DialogTitle>
        <DialogDescription>{t('admin:apiKeys.form.description')}</DialogDescription>
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <FormError message={formError} />
          <TextField
            autoComplete="off"
            label={t('admin:apiKeys.form.name')}
            hint={t('admin:apiKeys.form.nameHint')}
            error={errors.name}
            {...register('name')}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : null}
              {t('admin:apiKeys.form.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
