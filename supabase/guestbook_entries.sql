-- 방명록 테이블. Supabase SQL Editor에서 1회 실행.
create table if not exists public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nickname text not null,
  message text not null,
  emoji text,
  lat numeric not null,
  lng numeric not null,
  ip_hash text,
  is_hidden boolean not null default false
);

-- RLS 활성화 + 정책 없음 = anon 키 접근 전면 차단.
-- 접근은 service role 키(RLS 우회)를 쓰는 서버리스 함수만 가능.
alter table public.guestbook_entries enable row level security;

create index if not exists guestbook_entries_created_at_idx
  on public.guestbook_entries (created_at desc);

create index if not exists guestbook_entries_ip_hash_idx
  on public.guestbook_entries (ip_hash, created_at desc);
