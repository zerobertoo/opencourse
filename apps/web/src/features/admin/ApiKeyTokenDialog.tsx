import { Check, Copy, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/** Shows an API key token once, right after the key was created. */
export function ApiKeyTokenDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const { t } = useTranslation('admin');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      toast.error(t('apiKeys.token.copyFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('apiKeys.token.title')}</DialogTitle>
        <DialogDescription>{t('apiKeys.token.description')}</DialogDescription>
        <div className="mt-4 space-y-4">
          <p
            role="note"
            className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('apiKeys.token.warning')}
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={token}
              aria-label={t('apiKeys.token.label')}
              className="font-mono text-xs"
              onFocus={(event) => event.target.select()}
            />
            <Button variant="outline" onClick={() => void copy()}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? t('apiKeys.token.copied') : t('apiKeys.token.copy')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('apiKeys.token.howTo')}</p>
          <div className="flex justify-end">
            <Button onClick={onClose}>{t('apiKeys.token.done')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
