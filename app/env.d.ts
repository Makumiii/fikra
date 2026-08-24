export {};

declare global {
  interface Env {
    OWNER_EMAIL: string;
    BETTER_AUTH_SECRET?: string;
    SESSION_SECRET?: string;
    SMTP_HOST?: string;
    SMTP_PORT?: string;
    SMTP_USERNAME?: string;
    SMTP_PASSWORD?: string;
    SMTP_FROM_EMAIL?: string;
    SMTP_FROM_NAME?: string;
  }

  namespace Cloudflare {
    interface Env {
      OWNER_EMAIL: string;
      BETTER_AUTH_SECRET?: string;
      SESSION_SECRET?: string;
      SMTP_HOST?: string;
      SMTP_PORT?: string;
      SMTP_USERNAME?: string;
      SMTP_PASSWORD?: string;
      SMTP_FROM_EMAIL?: string;
      SMTP_FROM_NAME?: string;
    }
  }
}
