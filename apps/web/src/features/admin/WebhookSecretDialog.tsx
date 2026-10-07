import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/** Shows a webhook secret once, right after it was created or replaced. */
export function WebhookSecretDialog({ secret, onClose }: { secret: string; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      toast.error(t('webhooks.secret.copyFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('webhooks.secret.title')}</DialogTitle>
        <DialogDescription>{t('webhooks.secret.description')}</DialogDescription>
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Input
              readOnly
              value={secret}
              aria-label={t('webhooks.secret.label')}
              className="font-mono text-xs"
              onFocus={(event) => event.target.select()}
            />
            <Button variant="outline" onClick={() => void copy()}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? t('webhooks.secret.copied') : t('webhooks.secret.copy')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('webhooks.secret.howTo')}</p>
          <div className="flex justify-end">
            <Button onClick={onClose}>{t('webhooks.secret.done')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
