PRAGMA foreign_keys = ON;

CREATE TABLE auth_user (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL,
  image TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE TABLE auth_session (
  id TEXT NOT NULL PRIMARY KEY,
  expiresAt DATE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);

CREATE TABLE auth_account (
  id TEXT NOT NULL PRIMARY KEY,
  issuer TEXT NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt DATE,
  refreshTokenExpiresAt DATE,
  scope TEXT,
  password TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE TABLE auth_verification (
  id TEXT NOT NULL PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt DATE NOT NULL,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE TABLE auth_rate_limit (
  id TEXT NOT NULL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  lastRequest BIGINT NOT NULL
);

CREATE INDEX auth_session_userId_idx ON auth_session(userId);
CREATE INDEX auth_account_userId_idx ON auth_account(userId);
CREATE INDEX auth_verification_identifier_idx ON auth_verification(identifier);
CREATE UNIQUE INDEX auth_account_issuer_accountId_uidx ON auth_account(issuer, accountId);

ALTER TABLE users ADD COLUMN auth_user_id TEXT;
CREATE UNIQUE INDEX idx_users_auth_user_id ON users(auth_user_id);

INSERT INTO auth_user (id, name, email, emailVerified, createdAt, updatedAt)
SELECT id, display_name, email, 1, datetime(created_at, 'unixepoch'), datetime(updated_at, 'unixepoch')
FROM users
WHERE status = 'active';

UPDATE users SET auth_user_id = id WHERE status = 'active' AND auth_user_id IS NULL;
