import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { settingsQuery } from "@/lib/directory";
import { PWAInstallButton } from "@/components/PWAInstallButton";

export function SiteHeader() {
  const { data } = useQuery(settingsQuery);
  const [imgFailed, setImgFailed] = useState(false);
  const name = data?.["app_name"] || "أهل الصنعة";
  const tagline = data?.["tagline"] || "كل صنعة عند أهلها";
  const logo = !imgFailed ? data?.["logo_url"] : null;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur shadow-xs">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          {logo ? (
            <img
              src={logo}
              alt={name}
              loading="eager"
              decoding="async"
              onError={() => setImgFailed(true)}
              className="size-10 sm:size-11 rounded-xl object-contain bg-background border border-border/50 shrink-0"
            />
          ) : (
            <span className="grid size-10 sm:size-11 place-items-center rounded-xl bg-primary text-xl sm:text-2xl font-extrabold text-primary-foreground shrink-0 shadow-xs">
              {name.charAt(0)}
            </span>
          )}
          <span className="leading-tight truncate">
            <span className="block text-base sm:text-lg font-extrabold text-foreground truncate">{name}</span>
            <span className="block text-xs text-muted-foreground truncate">{tagline}</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />
        </div>
      </div>
    </header>
  );
}
