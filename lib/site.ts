export const SITE_NAME = "CarrerFit.com";
export function siteUrl(path = "/") { return new URL(path, process.env.APP_URL || process.env.WEB_URL || "https://carrerfit.com").toString(); }
