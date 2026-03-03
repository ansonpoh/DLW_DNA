create schema if not exists users;
create schema if not exists reports;

create table if not exists users.telegram_user_links (
  link_id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null unique,
  chat_id text,
  telegram_username text,
  display_name_snapshot text not null,
  user_id uuid not null references users.users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_telegram_user_links_user_id
  on users.telegram_user_links(user_id);

create table if not exists reports.report_dispatches (
  dispatch_id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports.reports(report_id) on delete cascade,
  agency text not null,
  channel text not null,
  payload_json jsonb not null,
  delivery_status text not null default 'prepared',
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_report_dispatches_report_id
  on reports.report_dispatches(report_id);
