"use client";

import { useTransition } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { markContacted, undoMarkContacted } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { UNDO_WINDOW_MS } from "@/lib/mark-contacted";

// The undo closes over the contact and the previous mark, not over this component: the toast lives in
// the <Toaster> of the layout and still works if the card is gone by the time "Отменить" is pressed
async function undoMark(contactId: number, previous: string | null) {
  try {
    await undoMarkContacted(contactId, previous);
  } catch {
    toast.error("Не удалось отменить. Проверьте, что база данных запущена, и попробуйте ещё раз.");
  }
}

export function MarkContactedButton({ contactId }: { contactId: number }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const { previous } = await markContacted(contactId);
        toast.success("Отметили общение", {
          duration: UNDO_WINDOW_MS,
          action: { label: "Отменить", onClick: () => undoMark(contactId, previous) },
        });
      } catch {
        toast.error("Не удалось отметить общение. Проверьте, что база данных запущена, и попробуйте ещё раз.");
      }
    });
  }

  return (
    <Button variant="secondary" disabled={isPending} onClick={handleClick}>
      {isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon strokeWidth={2.5} />}
      Связались
    </Button>
  );
}
