"use client";

// The groups in the row can be reordered by dragging: with a mouse, by pressing and holding on a phone,
// and from the keyboard (Space takes, arrows move, Space drops, Escape cancels). "Все" stays first
// and the "Группы" button last: they are outside the sortable list.

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  closestCenter,
  DndContext,
  KeyboardCode,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";

import { reorderGroups } from "@/app/actions";
import { GroupsDialog } from "@/components/groups-dialog";
import { groupColorClasses } from "@/lib/group-colors";
import type { GroupListItem } from "@/lib/groups";
import { cn } from "@/lib/utils";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const screenReaderInstructions = {
  draggable:
    "Чтобы переставить группу, нажмите Пробел. Стрелками влево и вправо — переместить, Пробел — положить, Escape — отменить.",
};

// The chosen group lives in the address (?group=<id>), so it survives a reload, "Back" and a copied link.
// The links keep the search query and drop the "new contact" highlight
export function GroupFilter({ groups, selectedId }: { groups: GroupListItem[]; selectedId: number | null }) {
  const searchParams = useSearchParams();
  const listRef = useRef<HTMLUListElement>(null);
  // A stable id keeps the server and browser markup of the drag hints the same
  const dndId = useId();
  const reduceMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );

  // The new order shows at once on drop; the server sends the same order back after saving
  const [order, setOrder] = useState(groups);
  const [seenGroups, setSeenGroups] = useState(groups);
  if (groups !== seenGroups) {
    setSeenGroups(groups);
    setOrder(groups);
  }

  // The mouse button is released over the link, so the browser clicks it after a drag: that click is swallowed
  const justDragged = useRef(false);

  const sensors = useSensors(
    // Mouse and touch apart, not one pointer sensor: a pointer sensor would take a quick swipe on a phone
    // for a drag, and the row would stop scrolling
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter keeps opening the link
      keyboardCodes: { start: [KeyboardCode.Space], end: [KeyboardCode.Space], cancel: [KeyboardCode.Esc] },
    }),
  );

  // On a phone the chosen group may be past the edge of the row: bring it into view
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId]);

  function hrefFor(groupId: number | null) {
    const params = new URLSearchParams(searchParams);
    params.delete("added");
    if (groupId === null) {
      params.delete("group");
    } else {
      params.set("group", String(groupId));
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  }

  // dnd-kit reports the group over its own place right after it is taken; announcing that would cut off
  // "взята", so a move is announced only when the place really changes
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const nameOf = (id: UniqueIdentifier) => order.find((group) => group.id === id)?.name ?? "";
  const placeOf = (id: UniqueIdentifier) =>
    `место ${order.findIndex((group) => group.id === id) + 1} из ${order.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      lastOverId.current = active.id;
      return `Группа «${nameOf(active.id)}» взята. Стрелками влево и вправо — переместить, Пробел — положить, Escape — отменить`;
    },
    onDragOver: ({ active, over }) => {
      if (!over || over.id === lastOverId.current) return undefined;
      lastOverId.current = over.id;
      return `Группа «${nameOf(active.id)}» перемещена на ${placeOf(over.id)}`;
    },
    onDragEnd: ({ active, over }) =>
      over ? `Группа «${nameOf(active.id)}» положена на ${placeOf(over.id)}` : `Группа «${nameOf(active.id)}» положена`,
    onDragCancel: ({ active }) => `Перемещение отменено. Группа «${nameOf(active.id)}» на прежнем месте`,
  };

  function markDragged() {
    justDragged.current = true;
    // No click follows when the button is released outside the link
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    markDragged();
    if (!over || active.id === over.id) return;

    const previous = order;
    const next = arrayMove(
      order,
      order.findIndex((group) => group.id === active.id),
      order.findIndex((group) => group.id === over.id),
    );
    setOrder(next);
    try {
      await reorderGroups(next.map((group) => group.id));
    } catch {
      setOrder(previous);
      toast.error("Не удалось сохранить порядок групп");
    }
  }

  return (
    <nav aria-label="Фильтр по группам" className="min-w-0">
      {/* Phones scroll the row sideways instead of wrapping it; the vertical padding keeps the shadows unclipped */}
      <ul
        ref={listRef}
        className="-my-2 flex gap-2 overflow-x-auto py-2 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible"
        onClickCapture={(event) => {
          if (justDragged.current) {
            event.preventDefault();
            event.stopPropagation();
            justDragged.current = false;
          }
        }}
      >
        <li className="shrink-0">
          <FilterLink href={hrefFor(null)} selected={selectedId === null}>
            Все
          </FilterLink>
        </li>
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{ announcements, screenReaderInstructions }}
          onDragEnd={handleDragEnd}
          onDragCancel={markDragged}
        >
          <SortableContext items={order.map((group) => group.id)} strategy={horizontalListSortingStrategy}>
            {order.map((group) => {
              const selected = group.id === selectedId;
              return (
                <SortableGroup
                  key={group.id}
                  group={group}
                  // Pressing the chosen group again clears the filter
                  href={hrefFor(selected ? null : group.id)}
                  selected={selected}
                  reduceMotion={reduceMotion}
                />
              );
            })}
          </SortableContext>
        </DndContext>
        <li className="shrink-0">
          <GroupsDialog groups={order} />
        </li>
      </ul>
    </nav>
  );
}

function SortableGroup({
  group,
  href,
  selected,
  reduceMotion,
}: {
  group: GroupListItem;
  href: string;
  selected: boolean;
  reduceMotion: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    attributes: { roleDescription: "группа, можно переставить" },
    // No sliding of the other buttons with "reduce motion"
    transition: reduceMotion ? null : undefined,
  });

  return (
    <li
      ref={setNodeRef}
      className={cn("shrink-0", isDragging && "relative z-10")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <FilterLink
        href={href}
        selected={selected}
        // The link stays a link for screen readers: dnd-kit would make it a button
        {...attributes}
        role={undefined}
        {...listeners}
        className={cn("touch-manipulation", isDragging && "shadow-card")}
      >
        <span aria-hidden className={cn("size-2.5 rounded-full ring-1 ring-rule", groupColorClasses[group.color])} />
        {group.name}
      </FilterLink>
    </li>
  );
}

function FilterLink({
  href,
  selected,
  className,
  children,
  ...props
}: { href: string; selected: boolean } & Omit<React.ComponentProps<typeof Link>, "href">) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold whitespace-nowrap transition-colors duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected ? "bg-ink text-white" : "bg-card text-ink shadow-mock hover:bg-mint-50",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
