-- Only the last attempt for LFA material recovery, not a general pipeline work ledger.
create table public.lfa_material_recovery_attempts (
  lfa_match_id text primary key,
  attempted_at timestamptz not null
);
alter table public.lfa_material_recovery_attempts enable row level security;
revoke all on public.lfa_material_recovery_attempts from anon, authenticated;
grant all on public.lfa_material_recovery_attempts to service_role;

-- Record before the supplier request. Failed/timed-out attempts keep their place in the rotation.
-- The route has a 120-second ceiling, shorter than the 15-minute exclusion period.
create or replace function public.claim_lfa_material_recovery(p_lfa_match_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed text;
begin
  if p_lfa_match_id is null or btrim(p_lfa_match_id) = '' then
    raise exception 'missing LFA match ID';
  end if;
  insert into public.lfa_material_recovery_attempts(lfa_match_id, attempted_at)
    values(p_lfa_match_id, now())
  on conflict (lfa_match_id) do update set attempted_at = excluded.attempted_at
    where lfa_material_recovery_attempts.attempted_at <= now() - interval '15 minutes'
  returning lfa_match_id into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_lfa_material_recovery(text) from public, anon, authenticated;
grant execute on function public.claim_lfa_material_recovery(text) to service_role;
