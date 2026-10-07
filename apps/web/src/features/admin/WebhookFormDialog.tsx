import { zodResolver } from '@hookform/resolvers/zod';
import {
  domainEventNameSchema,
  type WebhookEndpoint,
  type WebhookEndpointWithSecret,
} from '@opencourse/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckboxField, FormError } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useWebhookMutations } from '@/hooks/adminQueries';
import { webhookFormSchema, type WebhookFormValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { webhookEventKey } from '@/lib/webhookEvents';

/** Creates a webhook, or edits `webhook` when given. Creating hands the one-time secret back. */
export function WebhookFormDialog({
  webhook,
  onClose,
  onCreated,
}: {
  webhook: WebhookEndpoint | null;
  onClose: () => void;
  onCreated: (created: WebhookEndpointWithSecret) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { create, update } = useWebhookMutations();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WebhookFormValues>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues: {
      url: webhook?.url ?? '',
      description: webhook?.description ?? '',
      events: webhook?.events ?? [],
    },
  });

  const editing = webhook !== null;
  const pending = create.isPending || update.isPending;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (webhook) {
        await update.mutateAsync({ id: webhook.id, patch: values });
        toast.success(t('admin:webhooks.form.updatedToast'));
        onClose();
      } else {
        const created = await create.mutateAsync(values);
        toast.success(t('admin:webhooks.form.createdToast'));
        onCreated(created);
      }
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>
          {t(editing ? 'admin:webhooks.form.editTitle' : 'admin:webhooks.form.createTitle')}
        </DialogTitle>
        <DialogDescription>{t('admin:webhooks.form.description')}</DialogDescription>
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <FormError message={formError} />
          <TextField
            type="url"
            autoComplete="off"
            className="font-mono"
            label={t('admin:webhooks.form.url')}
            hint={t('admin:webhooks.form.urlHint')}
            error={errors.url}
            {...register('url')}
          />
          <TextField
            autoComplete="off"
            label={t('admin:webhooks.form.note')}
            hint={t('admin:webhooks.form.noteHint')}
            error={errors.description}
            {...register('description')}
          />
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t('admin:webhooks.form.events')}</legend>
            <p className="text-sm text-muted-foreground">{t('admin:webhooks.form.eventsHint')}</p>
            {domainEventNameSchema.options.map((name) => (
              <CheckboxField
                key={name}
                label={t(`admin:webhooks.events.${webhookEventKey(name)}`)}
                hint={name}
                value={name}
                {...register('events')}
              />
            ))}
            {errors.events?.message ? (
              <p role="alert" className="text-sm text-destructive">
                {t(`common:${errors.events.message}` as 'common:validation.required')}
              </p>
            ) : null}
          </fieldset>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {t(editing ? 'admin:webhooks.form.submitEdit' : 'admin:webhooks.form.submitCreate')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
