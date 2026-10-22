import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { usePlatformSettings } from '@/hooks/adminQueries';
import { brandCss } from '@/lib/brandColor';
import { pageTitleKey } from '@/lib/pageTitle';

const STYLE_ELEMENT_ID = 'opencourse-brand';
/** The designed palette in `index.css`; only a different color needs overriding. */
const DEFAULT_PRIMARY = '#2f6f5e';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Applies the instance branding (primary color in both themes) and keeps the browser title as
 * "Page · Platform name", so tabs and history entries can be told apart. Renders nothing.
 */
export function BrandStyles() {
  const { data } = usePlatformSettings();
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  const name = data?.brand.name;
  const primaryColor = data?.brand.primaryColor;
  const pageTitle = t(`pageTitle.${pageTitleKey(pathname)}`);

  useEffect(() => {
    if (!primaryColor || !HEX_COLOR.test(primaryColor)) return;
    if (primaryColor.toLowerCase() === DEFAULT_PRIMARY) return;
    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = brandCss(primaryColor);
    document.head.appendChild(style);
    return () => style.remove();
  }, [primaryColor]);

  useEffect(() => {
    document.title = `${pageTitle} · ${name ?? t('app.name')}`;
  }, [pageTitle, name, t]);

  return null;
}
