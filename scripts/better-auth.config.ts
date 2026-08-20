/** Config shim for `@better-auth/cli`, which expects a constructed `auth` export. */
import { auth as getAuth } from "../src/lib/auth/server";

export const auth = getAuth();
