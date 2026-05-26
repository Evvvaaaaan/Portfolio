create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  source text not null default 'portfolio',
  created_at timestamptz not null default now()
);

create table if not exists public.resume_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  source text not null default 'portfolio',
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;
alter table public.resume_requests enable row level security;
