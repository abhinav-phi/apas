-- ============================================================
-- AuthentiChain v12: Scope profiles SELECT (privacy loophole)
-- Bug: "Users can view all profiles" policy used USING (true) —
--      ANY authenticated user could read every user's full_name +
--      company_name via a direct API call (Users page is only
--      UI-guarded, the data was not).
-- Fix: SELECT restricted to own row OR admin. No other page needs
--      cross-profile reads (verified: AuthContext/Settings = own,
--      Users = admin-only).
-- SAFE TO RE-RUN.
-- ============================================================

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile or admins see all"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

SELECT 'v12 applied' AS status;
