-- Restore client-accessible username→email lookup so username login works without
-- the edge function (which requires a separate `supabase functions serve` process in
-- local dev). The email is used by the client solely to call signInWithPassword; it is
-- never displayed in the UI.
--
-- Security note: this allows an anon caller to confirm that a username exists and
-- learn its associated email. Acceptable for this community platform where usernames
-- are already publicly visible. Rate limiting from Supabase Auth still applies on
-- the subsequent signInWithPassword call.

GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon;
