import Link from "next/link";

import { BACK_TO_LIST, CONTACT_DELETED } from "@/lib/action-messages";

// Shown instead of an error when the contact was deleted in another tab. `role="alert"` so a screen reader
// reads it at once; `onNavigate` lets a window close itself when the link is followed
export function ContactDeletedNotice({
  id,
  listHref,
  onNavigate,
}: {
  id?: string;
  listHref: string;
  onNavigate?: () => void;
}) {
  return (
    <p id={id} role="alert" className="flex flex-wrap gap-x-3 text-sm text-destructive">
      <span>{CONTACT_DELETED}</span>
      <Link href={listHref} onClick={onNavigate} className="font-semibold underline underline-offset-2">
        {BACK_TO_LIST}
      </Link>
    </p>
  );
}
