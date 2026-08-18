-- Optional password credential for users. The account stays passwordless by default
-- (email OTP + Google remain primary); a user may set a password from their profile and
-- then also sign in with it. NULL means no password has ever been set.
ALTER TABLE users ADD COLUMN password_hash TEXT;
