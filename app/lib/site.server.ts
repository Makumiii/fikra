import type { SiteSettings } from "./models";

type SiteSettingsRow = {
  site_name: string;
  site_description: string;
  locale: string;
  timezone: string;
  setup_completed_at: number | null;
};

export async function getSiteSettings(db: D1Database): Promise<SiteSettings> {
  const row = await db.prepare(`SELECT site_name, site_description, locale, timezone, setup_completed_at
    FROM site_settings WHERE id = 1`).first<SiteSettingsRow>();
  if (!row) {
    return {
      siteName: "Fikra",
      siteDescription: "An independent, single-author social blog.",
      locale: "en",
      timezone: "UTC",
      configured: false,
    };
  }
  return {
    siteName: row.site_name,
    siteDescription: row.site_description,
    locale: row.locale,
    timezone: row.timezone,
    configured: Boolean(row.setup_completed_at),
  };
}

export async function isSiteConfigured(db: D1Database): Promise<boolean> {
  const row = await db.prepare("SELECT setup_completed_at FROM site_settings WHERE id = 1")
    .first<{ setup_completed_at: number | null }>();
  return Boolean(row?.setup_completed_at);
}

export async function requireConfiguredSite(db: D1Database) {
  if (!(await isSiteConfigured(db))) {
    throw new Response("Site setup is not complete", { status: 503 });
  }
}
