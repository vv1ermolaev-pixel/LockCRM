"use client";

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SEARCH_DELAY_MS = 250;

export function ContactSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [value, setValue] = useState(urlQuery);
  const [sentQuery, setSentQuery] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL can change without typing (e.g. after adding a contact): mirror it in the input
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== sentQuery) {
      setValue(urlQuery);
      setSentQuery(urlQuery);
    }
  }

  function search(rawQuery: string) {
    const query = rawQuery.trim();
    setSentQuery(query);
    startTransition(() => {
      router.replace(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname, { scroll: false });
    });
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(nextValue), SEARCH_DELAY_MS);
  }

  function clear() {
    clearTimeout(timer.current);
    setValue("");
    search("");
  }

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label="Поиск по имени"
        placeholder="Найти по имени…"
        autoComplete="off"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            clear();
          }
        }}
        className="h-10 bg-background pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute top-1/2 right-1.5 -translate-y-1/2">
        {isPending ? (
          <Loader2Icon className="mr-1.5 size-4 animate-spin text-muted-foreground" aria-label="Ищем…" />
        ) : (
          value && (
            <Button variant="ghost" size="icon-sm" onClick={clear} aria-label="Очистить поиск">
              <XIcon />
            </Button>
          )
        )}
      </div>
    </div>
  );
}
