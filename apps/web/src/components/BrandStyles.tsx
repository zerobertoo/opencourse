import { useEffect } from 'react';
import { usePlatformSettings } from '@/hooks/adminQueries';
import { brandCss } from '@/lib/brandColor';

const STYLE_ELEMENT_ID = 'opencourse-brand';
/** The designed palette in `index.css`; only a different color needs overriding. */
const DEFAULT_PRIMARY = '#2f6f5e';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Applies the instance branding (primary color in both themes and the page title). Renders nothing. */
export function BrandStyles() {
  const { data } = usePlatformSettings();
  const name = data?.brand.name;
  const primaryColor = data?.brand.primaryColor;

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
    if (name) document.title = name;
  }, [name]);

  return null;
}
