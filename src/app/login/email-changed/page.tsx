import Link from "next/link";
import { redirect } from "next/navigation";
import { Link2OffIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

// Where the link from the email leads, for the person who opens it and for one who has no login on this device.
// Public: /settings without a login would go to the login page and lose the reason
export default async function EmailChangedPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  if (error) {
    return (
      <EmptyState
        icon={<Link2OffIcon aria-hidden />}
        title="Ссылка устарела"
        text="Откройте настройки и запросите смену почты заново."
        action={
          <Button asChild>
            <Link href="/settings">В настройки</Link>
          </Button>
        }
      />
    );
  }

  redirect((await getCurrentUser()) ? "/settings?email=changed" : "/login?email=changed");
}
