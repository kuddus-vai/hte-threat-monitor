/**
 * SEO slug utilities — shared by backend (canonical/sitemap) and frontend (links).
 * Deterministic: same title + id → same slug everywhere.
 */

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

/** Full article slug: title-based + short id suffix for uniqueness. */
export function articleSlug(title: string, id: string): string {
  const base = slugify(title) || "report";
  return `${base}-${id.slice(-6)}`;
}
