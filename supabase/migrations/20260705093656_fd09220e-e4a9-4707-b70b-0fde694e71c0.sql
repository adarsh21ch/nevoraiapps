
-- Subscription/pricing fields on tenants
alter table public.tenants
  add column if not exists monthly_price integer not null default 0,
  add column if not exists setup_fee integer not null default 0,
  add column if not exists billing_day integer not null default 1,
  add column if not exists last_paid_date date,
  add column if not exists subscription_status text not null default 'due',
  add column if not exists platform_notes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_billing_day_chk') then
    alter table public.tenants add constraint tenants_billing_day_chk check (billing_day between 1 and 28);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_sub_status_chk') then
    alter table public.tenants add constraint tenants_sub_status_chk check (subscription_status in ('paid','due','overdue'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_monthly_price_nn') then
    alter table public.tenants add constraint tenants_monthly_price_nn check (monthly_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_setup_fee_nn') then
    alter table public.tenants add constraint tenants_setup_fee_nn check (setup_fee >= 0);
  end if;
end $$;

-- Price change log
create table if not exists public.tenant_price_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  old_price integer not null,
  new_price integer not null,
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select, insert on public.tenant_price_changes to authenticated;
grant all on public.tenant_price_changes to service_role;

alter table public.tenant_price_changes enable row level security;

drop policy if exists "admin insert price change" on public.tenant_price_changes;
create policy "admin insert price change" on public.tenant_price_changes
  for insert to authenticated
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists "admin or tenant read price changes" on public.tenant_price_changes;
create policy "admin or tenant read price changes" on public.tenant_price_changes
  for select to authenticated
  using (public.is_platform_admin(auth.uid()) or public.is_tenant_member(auth.uid(), tenant_id));

create index if not exists tenant_price_changes_tenant_idx
  on public.tenant_price_changes(tenant_id, created_at desc);

-- Seed platform admin user
do $$
declare
  v_user_id uuid;
  v_email text := 'admin@academyos.test';
  v_password text := 'Platform@2026';
begin
  select id into v_user_id from auth.users where email = v_email limit 1;
  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated',
      v_email, crypt(v_password, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  else
    update auth.users
       set encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_user_id;
  end if;
  insert into public.platform_admins (user_id) values (v_user_id) on conflict do nothing;
end $$;
