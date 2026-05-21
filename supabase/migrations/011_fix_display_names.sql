-- One-time fix: update display_name from contacts table for users who registered
-- with their email prefix or full email as display_name instead of their real name
UPDATE profiles p
SET display_name = c.name
FROM contacts c
WHERE c.email = p.email
  AND (
    p.display_name = split_part(p.email, '@', 1)
    OR p.display_name = p.email
    OR p.display_name = ''
  );
