import { zodResolver } from '@hookform/resolvers/zod';
import { roleSchema, type User } from '@opencourse/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, SelectField } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useUserMutations } from '@/hooks/adminQueries';
import { editUserSchema, type EditUserValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';

/** Changes the role of a user. Mounted per user (keyed at the call site) so the form starts fresh. */
export function EditUserDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const { updateRole } = useUserMutations();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { role: user.role },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await updateRole.mutateAsync({ userId: user.id, role: values.role });
      toast.success(t('admin:users.edit.successToast', { name: user.name }));
      onClose();
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('admin:users.edit.title')}</DialogTitle>
        <DialogDescription>
          {user.name} · {user.email}
        </DialogDescription>
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <FormError message={formError} />
          <SelectField
            label={t('admin:users.edit.role')}
            hint={t('admin:users.edit.roleHint')}
            error={errors.role}
            {...register('role')}
          >
            {roleSchema.options.map((role) => (
              <option key={role} value={role}>
                {t(`admin:roles.${role}`)}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={updateRole.isPending}>
              {updateRole.isPending ? <Spinner /> : null}
              {t('admin:users.edit.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
