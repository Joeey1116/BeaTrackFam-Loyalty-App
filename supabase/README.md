# BeaTrackFam Rewards — backend setup

How to set up the app's database and keys. Do this once, in order.

1. **Create your Supabase project**
   - Go to [supabase.com](https://supabase.com) and sign up / sign in (free tier is fine).
   - Click **New project**, name it something like `beatrackfam-rewards`, and save the database password somewhere safe.
   - Wait for it to finish setting up (takes about a minute).

2. **Run the schema**
   - In the Supabase dashboard, open **SQL Editor** from the left sidebar.
   - Open the file `supabase/schema.sql` on your computer, copy everything in it.
   - Paste it into the SQL Editor and click **Run**.
   - It should finish with no errors. You can run it again any time — it's safe.

3. **Add the launch rewards**
   - Still in the SQL Editor, clear it.
   - Copy everything in `supabase/seed.sql`, paste it, and click **Run**.
   - This adds the 4 starting rewards (10% off, free shipping, $10 off, free tee).

3b. **Add push-token storage** (one more small file)
   - Clear the editor again, copy everything in `supabase/migration_push_token.sql`, paste, and click **Run**.
   - This adds the `push_token` column so the app can send you reward/drop alerts.

4. **Copy your keys into the app**
   - In the Supabase dashboard, go to **Project Settings → API**.
   - Copy the **Project URL** and the **anon public** key.
   - Paste them into the app's `.env` file as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

That's it — the app will handle sign-ups, points, tiers, and redemptions from here.
