/**
 * Delete account → permanently delete the caller's loyalty account.
 *
 * Apple Guideline 5.1.1(v): apps that offer account creation must also
 * offer account deletion. The Profile screen's DELETE ACCOUNT button
 * calls this function via supabase.functions.invoke('delete-account').
 *
 * The caller is identified from their Supabase Auth JWT — a user can only
 * ever delete their own account. Deletion removes the caller's
 * auth.users record with the service-role key; the schema's
 * ON DELETE CASCADE then wipes their profiles row, points_ledger
 * entries, and redemptions automatically.
 *
 * Referral links are nulled first: other members' profiles.referred_by
 * can point at the caller, and that foreign key has NO ACTION, which
 * would block the delete.
 *
 * SETUP (Joey, in the Supabase dashboard):
 * 1. Supabase Dashboard → Edge Functions → deploy this function
 *    (or `supabase functions deploy delete-account`).
 * 2. No secrets to set by hand: SUPABASE_URL, SUPABASE_ANON_KEY and
 *    SUPABASE_SERVICE_ROLE_KEY are injected by Supabase automatically.
 *    NEVER hardcode the service-role key anywhere.
 */

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Missing or invalid authorization header' });
  }

  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!url || !anonKey || !serviceRoleKey) {
    return json(500, { error: 'Function is not configured' });
  }

  // Identify the caller from their own JWT — never trust a user id sent
  // in the request body.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return json(401, { error: 'Could not verify your session — please sign in again' });
  }
  const userId = userData.user.id;

  const admin = createClient(url, serviceRoleKey);

  // Null referral links pointing at the caller so the NO ACTION foreign
  // key on profiles.referred_by doesn't block the delete.
  const { error: referralError } = await admin
    .from('profiles')
    .update({ referred_by: null })
    .eq('referred_by', userId);
  if (referralError) {
    console.error('Failed to clear referral links:', referralError.message);
    return json(500, { error: 'Account deletion failed — nothing was deleted' });
  }

  // Deleting the auth user cascades to profiles, points_ledger and
  // redemptions (see supabase/schema.sql).
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('Failed to delete auth user:', deleteError.message);
    return json(500, { error: 'Account deletion failed — nothing was deleted' });
  }

  return json(200, { ok: true });
});
