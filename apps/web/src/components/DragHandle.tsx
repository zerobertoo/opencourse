import { GripVertical } from 'lucide-react';

/** Grip button that activates a dnd-kit sortable item; `touch-none` keeps the drag from scrolling the page. */
export function DragHandle({
  label,
  setActivatorNodeRef,
  attributes,
  listeners,
}: {
  label: string;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: React.HTMLAttributes<HTMLElement> | undefined;
}) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing sm:size-9"
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );
}
