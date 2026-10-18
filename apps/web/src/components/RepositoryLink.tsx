import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const REPOSITORY_URL = 'https://github.com/zerobertoo/opencourse';

/** Link to the project's source code, shown where the demo has no other mention of it. */
export function RepositoryLink() {
  const { t } = useTranslation();
  return (
    <a
      href={REPOSITORY_URL}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      {t('app.repository')}
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  );
}
