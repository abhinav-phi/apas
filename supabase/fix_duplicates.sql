-- ============================================================
-- FIX: Remove duplicate user_roles rows
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. See the duplicates
SELECT user_id, role, COUNT(*) as cnt
FROM public.user_roles
GROUP BY user_id, role
HAVING COUNT(*) > 1;

-- 2. Delete duplicates — keep only one row per (user_id, role)
DELETE FROM public.user_roles
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, role) id
  FROM public.user_roles
  ORDER BY user_id, role, id
);

-- 3. Add unique constraint to prevent this from happening again
ALTER TABLE public.user_roles
  ADD CONSTRAINT unique_user_role UNIQUE (user_id, role);

-- 4. Verify: should show exactly 1 row for your user
SELECT ur.*, au.email
FROM public.user_roles ur
JOIN auth.users au ON au.id = ur.user_id
WHERE au.email = 'alpha9coder@gmail.com';
