import { ServicesContext } from './ServicesContext';
import type { Services } from './types';

/** Lets a subtree use a different services implementation (tests). */
export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: React.ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}
