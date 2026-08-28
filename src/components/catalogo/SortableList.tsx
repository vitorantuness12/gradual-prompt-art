import { type ReactNode, useState } from "react";

import { cn } from "@/lib/utils";

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, dragHandleProps: { draggable: true; "aria-grabbed": boolean }) => ReactNode;
  className?: string;
}

/**
 * Lista reordenável por arrastar e soltar usando a API nativa do navegador,
 * evitando dependências extras. A ordem final é devolvida em `onReorder`.
 */
export function SortableList<T>({ items, getId, onReorder, renderItem, className }: SortableListProps<T>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const ids = items.map(getId);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    if (!moved) return;
    ids.splice(to, 0, moved);
    setDraggingId(null);
    onReorder(ids);
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((item) => {
        const id = getId(item);
        return (
          <li
            key={id}
            onDragStart={() => setDraggingId(id)}
            onDragEnd={() => setDraggingId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(id)}
            className={cn("rounded-xl transition", draggingId === id && "opacity-50")}
          >
            {renderItem(item, { draggable: true, "aria-grabbed": draggingId === id })}
          </li>
        );
      })}
    </ul>
  );
}
