import { LoaderCircle } from 'lucide-react';

/** Loading indicator for buttons and in-progress actions. */
export function Spinner() {
  return <LoaderCircle className="animate-spin" aria-hidden="true" />;
}
