-- One shared dataset for the "What to order today" tool.
create table if not exists public.inventory_datasets (
  id text primary key default 'main',
  data jsonb not null,
  source_name text,
  updated_at timestamptz not null default now()
);

-- Nobody can read or write from the browser directly.
-- Only the app's server (service key) can touch this table.
alter table public.inventory_datasets enable row level security;
