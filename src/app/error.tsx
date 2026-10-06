"use client";

import { useEffect } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-background px-6 py-14 text-center">
      <TriangleAlertIcon className="size-8 text-destructive" />
      <p className="font-medium">Не удалось загрузить данные</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Скорее всего, не запущена база данных. Запустите Docker Desktop и выполните в папке проекта{" "}
        <code className="rounded bg-muted px-1 py-0.5">docker compose up -d</code>, затем попробуйте снова.
      </p>
      <Button onClick={() => retry()} className="mt-2">
        Попробовать снова
      </Button>
    </div>
  );
}
