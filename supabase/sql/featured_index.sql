create index if not exists idx_providers_featured
  on public.providers (status, is_premium, created_at desc);
