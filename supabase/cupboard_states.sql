create table if not exists public.shared_cupboard_state (
  id text primary key,
  data jsonb not null default '{"items":[],"customCategories":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_shared_cupboard_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_shared_cupboard_updated_at on public.shared_cupboard_state;
create trigger trg_touch_shared_cupboard_updated_at
before update on public.shared_cupboard_state
for each row execute function public.touch_shared_cupboard_updated_at();

alter table public.shared_cupboard_state enable row level security;

drop policy if exists "shared_cupboard_select_main" on public.shared_cupboard_state;
drop policy if exists "shared_cupboard_insert_main" on public.shared_cupboard_state;
drop policy if exists "shared_cupboard_update_main" on public.shared_cupboard_state;

create policy "shared_cupboard_select_main"
on public.shared_cupboard_state
for select
to anon, authenticated
using (id = 'main');

create policy "shared_cupboard_insert_main"
on public.shared_cupboard_state
for insert
to anon, authenticated
with check (id = 'main');

create policy "shared_cupboard_update_main"
on public.shared_cupboard_state
for update
to anon, authenticated
using (id = 'main')
with check (id = 'main');
