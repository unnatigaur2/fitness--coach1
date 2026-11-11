-- TCR-004 as proposed (docs/handoff/trainee-app/TCR-004-diet-plans.md), so publishing a diet plan can
-- be tested before Developer 1 delivers the real table. Test database only: never applied to Supabase.

create table app.diet_plans (
  id uuid primary key,
  user_id uuid not null references app.users (id) on delete cascade,
  version int not null check (version >= 1),
  name text not null check (char_length(name) between 1 and 80),
  status text not null check (status in ('active', 'ended')),
  start_date date not null,
  calorie_target int check (calorie_target is null or calorie_target between 500 and 10000),
  protein_target int check (protein_target is null or protein_target between 10 and 500),
  note text check (note is null or char_length(note) <= 300),
  slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) <= 8),
  set_by_user_id uuid not null references app.users (id),
  set_by_role text not null check (set_by_role in ('head_coach', 'coach')),
  published_at timestamptz not null,
  ended_at timestamptz,
  change_seq bigint not null default nextval('app.change_seq'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index diet_plans_one_active on app.diet_plans (user_id) where status = 'active';
create index diet_plans_user_change_seq on app.diet_plans (user_id, change_seq);
create trigger diet_plans_touch before update on app.diet_plans
  for each row execute function app.touch_synced_row();
alter table app.diet_plans enable row level security;
