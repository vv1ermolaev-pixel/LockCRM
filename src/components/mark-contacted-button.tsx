"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { markContacted, undoMarkContacted } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { BACK_TO_LIST, CONTACT_DELETED, failureMessage } from "@/lib/action-messages";
import { UNDO_WINDOW_MS } from "@/lib/mark-contacted";

// The undo closes over the contact and the previous mark, not over this component: the toast lives in
// the <Toaster> of the layout and still works if the card is gone by the time "Отменить" is pressed
async function undoMark(contactId: number, previous: string | null) {
  try {
    await undoMarkContacted(contactId, previous);
  } catch {
    toast.error(failureMessage("отменить"));
  }
}

// `listHref` is where "К списку контактов" leads when the contact turns out to be deleted
export function MarkContactedButton({ contactId, listHref }: { contactId: number; listHref: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const result = await markContacted(contactId);
        if (!result.ok) {
          // Not an error and not a success, and nothing to undo: the card stays where it is
          toast(CONTACT_DELETED, { action: { label: BACK_TO_LIST, onClick: () => router.push(listHref) } });
          return;
        }
        toast.success("Отметили общение", {
          duration: UNDO_WINDOW_MS,
          action: { label: "Отменить", onClick: () => undoMark(contactId, result.previous) },
        });
      } catch {
        toast.error(failureMessage("отметить общение"));
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
