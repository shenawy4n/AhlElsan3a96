import { Link } from "@tanstack/react-router";
import { Star, MapPin, BadgeCheck, Award, Zap, Building2 } from "lucide-react";
import { isPremiumActive, getCategoryUnit, type PublicProvider as ProviderWithRefs } from "@/lib/directory";
import { ContactButtons } from "@/components/ContactButtons";
import { parseWorkingHours, getOpenStatus } from "@/lib/working-hours";

export function normalizeServices(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((s) => (typeof s === "string" ? s.trim() : ""))
            .filter((s) => s.length > 0);
        }
      } catch {
        // continue
      }
    }
    return trimmed
      .split(/[,،\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

export function ProviderRatingBadge({
  summary,
}: {
  providerId?: string;
  summary?: { average: number; count: number };
}) {
  if (summary && summary.count > 0 && summary.average > 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-secondary/80 px-2 py-0.5 text-xs font-extrabold text-foreground"
        dir="ltr"
        aria-label={`تقييم ${summary.average.toFixed(1)} من 5 من ${summary.count} تقييم`}
      >
        <Star className="size-3.5 fill-amber-500 text-amber-500 inline" aria-hidden="true" />
        <span>{summary.average.toFixed(1)}</span>
        <span className="text-[11px] font-medium text-muted-foreground">({summary.count})</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-2 py-0.5 text-xs font-bold text-muted-foreground"
      aria-label="لا توجد تقييمات بعد - جديد"
    >
      <Star className="size-3.5 text-muted-foreground inline" aria-hidden="true" />
      <span>جديد</span>
    </span>
  );
}

export function PremiumBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-premium/12 px-2.5 py-1 text-xs font-bold text-premium ring-1 ring-premium/30">
      <Star className="size-3.5 fill-current" /> مميز
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary ring-1 ring-primary/30">
      <BadgeCheck className="size-3.5" /> موثّق
    </span>
  );
}

export function EmergencyBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-black text-warning ring-1 ring-warning/30">
      <Zap className="size-3.5 fill-current" /> طوارئ 24H
    </span>
  );
}

export function ProviderCard({
  provider,
  ratingSummary,
}: {
  provider: ProviderWithRefs;
  ratingSummary?: { average: number; count: number };
}) {
  const premium = isPremiumActive(provider);
  const hoursData = parseWorkingHours(provider.working_hours);
  const openStatus = hoursData ? getOpenStatus(hoursData) : null;

  const count = typeof ratingSummary?.count === "number"
    ? ratingSummary.count
    : typeof provider.review_count === "number"
      ? provider.review_count
      : 0;
  const average = typeof ratingSummary?.average === "number"
    ? ratingSummary.average
    : typeof provider.average_rating === "number"
      ? Number(provider.average_rating)
      : 0;
  const computedRating = count > 0 && average > 0 ? { average, count } : undefined;

  const normalizedServices = normalizeServices(provider.services);
  const visibleServices = normalizedServices.slice(0, 3);
  const remainingServicesCount = normalizedServices.length - 3;
  const rawDesc = provider.description?.trim();
  const shortDescription = rawDesc ? rawDesc.slice(0, 60) : "";

  return (
    <article className={`surface p-4 ${premium ? "ring-2 ring-premium/40" : ""}`}>
      <Link to="/provider/$id" params={{ id: provider.id }} className="block">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-extrabold text-foreground">{provider.name}</h3>
          <div className="flex flex-wrap justify-end gap-1">
            {hoursData?.isEmergency24h ? <EmergencyBadge /> : null}
            {provider.is_verified ? <VerifiedBadge /> : null}
            {premium ? <PremiumBadge /> : null}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-primary">
              {getCategoryUnit(provider.categories?.name, (provider.categories as any)?.unit_title || (provider as any).category_unit_title)}
            </span>
            <span className="mx-1.5">·</span>
            <MapPin className="inline size-3.5 align-[-2px]" /> {provider.areas?.name}
          </p>
          <div className="flex items-center gap-1.5">
            {openStatus && openStatus.isOpen !== null && !hoursData?.isEmergency24h && (
              <span
                suppressHydrationWarning
                className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                  openStatus.isOpen
                    ? "text-success"
                    : "text-muted-foreground"
                }`}
              >
                <span
                  suppressHydrationWarning
                  className={`size-1.5 rounded-full ${
                    openStatus.isOpen ? "bg-success" : "bg-muted-foreground/60"
                  }`}
                />
                {openStatus.isOpen ? "مفتوح" : "مغلق"}
              </span>
            )}
            <ProviderRatingBadge summary={computedRating} />
          </div>
        </div>
        {hoursData?.workshop?.hasWorkshop ? (
          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
            <Building2 className="inline size-3.5 text-primary" />
            <span>ورشة: {hoursData.workshop.workshopName || "مقر عمل ثابت"}</span>
          </p>
        ) : null}
        {provider.experience_options ? (
          <p className="mt-1 text-sm text-muted-foreground">
            <Award className="inline size-3.5 align-[-2px]" /> خبرة: {provider.experience_options.label}
          </p>
        ) : null}

        {/* Services chips (up to 3 + remaining) OR short description (first ~60 chars) */}
        {visibleServices.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5 max-h-14 overflow-hidden" aria-label="الخدمات المقدمة">
            {visibleServices.map((service, index) => (
              <span
                key={index}
                className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground"
              >
                {service}
              </span>
            ))}
            {remainingServicesCount > 0 && (
              <span className="inline-flex items-center rounded-md bg-secondary/80 px-1.5 py-0.5 text-xs font-bold text-muted-foreground">
                +{remainingServicesCount}
              </span>
            )}
          </div>
        ) : shortDescription ? (
          <p className="mt-2 truncate text-sm text-muted-foreground">
            {shortDescription}
            {rawDesc && rawDesc.length > 60 ? "…" : ""}
          </p>
        ) : null}
      </Link>

      <div className="mt-3">
        <ContactButtons
          providerId={provider.id}
          hasWhatsapp={provider.has_whatsapp}
          providerInfo={{
            name: provider.name,
            categoryName: provider.categories?.name,
            areaName: provider.areas?.name,
            isEmergency24h: hoursData?.isEmergency24h,
          }}
        />
      </div>
    </article>
  );
}
