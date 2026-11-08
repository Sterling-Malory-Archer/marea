import type { Db } from "@marea/db";
import type { Env } from "./config/env.js";
import type { Logger } from "./lib/logger.js";
import type { Storage } from "./modules/storage/storage.js";
import type { Mailer } from "./modules/mail/mailer.js";
import type { SessionUser } from "./modules/auth/sessions.js";

/** Everything a request handler may depend on — injected, never imported globally. */
export interface AppContext {
  env: Env;
  db: Db;
  log: Logger;
  storage: Storage;
  mailer: Mailer;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: SessionUser;
      customer?: SessionUser;
      requestId?: string;
    }
  }
}
