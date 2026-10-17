"use client";

import { useEffect } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={<TriangleAlertIcon className="text-destructive" />}
      title="Не удалось загрузить данные"
      text={
        <>
          Скорее всего, не запущена база данных. Запустите Docker Desktop и выполните в папке проекта{" "}
          <code className="rounded-6 bg-card px-1.5 py-0.5 font-mono text-sm">docker compose up -d</code>, затем
          попробуйте снова.
        </>
      }
      action={<Button onClick={() => retry()}>Попробовать снова</Button>}
    />
  );
}
