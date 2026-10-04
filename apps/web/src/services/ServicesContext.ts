import { createContext, useContext } from 'react';
import { services } from './index';
import type { Services } from './types';

/** Application services. The default is the one defined in `services/index.ts`; tests inject another. */
export const ServicesContext = createContext<Services>(services);

export function useServices(): Services {
  return useContext(ServicesContext);
}
