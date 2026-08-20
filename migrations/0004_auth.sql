-- better-auth core schema, generated from the INSTALLED library (not the abandoned CLI)
-- and vendored here so it runs through our own additive migration runner.
--
-- Regenerate after any better-auth upgrade:
--   createdb yardstick_authgen
--   AUTH_SCHEMA_DATABASE_URL=postgres://localhost:5432/yardstick_authgen npm run auth:schema
--   dropdb yardstick_authgen
-- A difference means a NEW additive migration is due. Never edit this file once committed.
--
-- Identity ids are uuid because auth sets advanced.database.generateId "uuid",
-- which lets memberships.user_id finally carry a real foreign key.

create table "user" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
create table "session" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" uuid not null references "user" ("id") on delete cascade);
create table "account" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "issuer" text not null, "accountId" text not null, "providerId" text not null, "userId" uuid not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);
create table "verification" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");
create unique index "account_issuer_accountId_uidx" on "account" ("issuer", "accountId");

alter table memberships
  add constraint memberships_user_id_fkey
  foreign key (user_id) references "user" ("id") on delete cascade;
