-- Public registration flow fix.
--
-- Anon visitors have INSERT-only access to public.registrations (no SELECT,
-- no UPDATE — the table holds personal data). The register page creates the
-- row in step 1 with a client-generated uuid, and step 3 attaches the UPI
-- payment reference to that same row through this SECURITY DEFINER function.
-- The registration id is returned only to the person who created it, so it
-- acts as the claim token; only rows still 'pending' can be claimed.

CREATE OR REPLACE FUNCTION public.claim_registration_payment(
  p_registration_id uuid,
  p_payment_ref text
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.registrations
  SET payment_status = 'claimed_paid',
      payment_ref = left(trim(p_payment_ref), 100)
  WHERE id = p_registration_id
    AND payment_status = 'pending'
    AND trim(coalesce(p_payment_ref, '')) <> ''
  RETURNING true;
$$;

REVOKE ALL ON FUNCTION public.claim_registration_payment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_registration_payment(uuid, text) TO anon, authenticated;
