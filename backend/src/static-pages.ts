/**
 * Static policy/SEO pages served from the Worker (zero-cost, no hosting needed).
 * Required for Google AdSense approval + crawlability.
 */

const SITE = "HTE Threat Monitor";
const MOTHER = "https://hightechenterprise.xyz";

/** ads.txt — authorizes the AdSense publisher account. Replace PUB_ID with yours. */
export function adsTxt(pubId: string): string {
  // Format: google.com, pub-XXXX, DIRECT, f08c47fec0942fa0
  return `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`;
}

export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n\n# Disallow crawl of internal API noise\nDisallow: /api/\n`;
}

function page(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} | ${SITE}</title>
<meta name="robots" content="index, follow" />
<style>
  body { background:#05070f; color:#e6edf3; font-family:Inter,system-ui,sans-serif; max-width:760px; margin:0 auto; padding:40px 20px; line-height:1.7; }
  h1 { color:#38bdf8; font-size:1.7rem; }
  h2 { color:#7dd3fc; font-size:1.15rem; margin-top:28px; }
  a { color:#38bdf8; }
  .back { display:inline-block; margin-bottom:20px; font-size:.85rem; border:1px solid #38bdf8; padding:6px 14px; border-radius:8px; }
  code { background:#111827; padding:2px 6px; border-radius:4px; }
</style>
</head>
<body>
<a class="back" href="/">← Back to ${SITE}</a>
${bodyHtml}
<hr style="border-color:#1f2937; margin-top:40px;" />
<p style="font-size:.8rem;color:#94a3b8;">Part of the <a href="${MOTHER}">High Tech Enterprise</a> network.</p>
</body>
</html>`;
}

export function privacyPage(): string {
  return page(
    "Privacy Policy",
    `<h1>Privacy Policy</h1>
<p>Effective date: ${new Date().toISOString().slice(0, 10)}</p>
<p>${SITE} is operated by High Tech Enterprise. This policy explains what data we collect and how third-party advertising is used.</p>

<h2>1. Information We Collect</h2>
<p>We do not require account registration. We may collect anonymous technical data such as browser type, approximate region (derived from IP), pages viewed, and referring site, solely to operate and improve the service.</p>

<h2>2. Cookies & Advertising</h2>
<p>We use Google AdSense to display advertisements. Google and its partners may use cookies to serve ads based on your prior visits. This is standard industry practice.</p>
<ul>
  <li>Google's use of advertising cookies is governed by the <a href="https://policies.google.com/technologies/ads">Google Ads Privacy & Terms</a>.</li>
  <li>You can opt out of personalized advertising at <a href="https://www.google.com/settings/ads">Ads Settings</a> or via <a href="https://www.aboutads.info/">aboutads.info</a>.</li>
  <li>We do <strong>not</strong> sell personal information.</li>
</ul>

<h2>3. Third-Party Links</h2>
<p>Article pages link to original sources for attribution. We are not responsible for the privacy practices of those external sites.</p>

<h2>4. Data Retention</h2>
<p>Aggregated, non-identifying analytics may be retained to maintain service quality. We do not store personally identifiable information.</p>

<h2>5. Contact</h2>
<p>Questions: <a href="${MOTHER}/contact">High Tech Enterprise Contact</a>.</p>`,
  );
}

export function aboutPage(): string {
  return page(
    "About HTE Threat Monitor",
    `<h1>About ${SITE}</h1>
<p>${SITE} is an automated, real-time intelligence dashboard tracking global cyber threats and technology developments across 8 curated sources. Content, including article briefings, is generated automatically from publicly reported information and clearly attributed to its original source.</p>

<h2>Editorial & AI Disclosure</h2>
<p>Article briefings are produced by an AI pipeline that rewrites publicly reported summaries into original prose. Every article links back to the originating report. We do not reproduce copyrighted source text.</p>

<h2>Mission</h2>
<p>To give defenders, researchers, and the curious a single, fast, always-on view of the threat landscape — free of charge.</p>

<h2>Contact</h2>
<p>Part of the <a href="${MOTHER}">High Tech Enterprise</a> network. Reach us via the <a href="${MOTHER}/contact">contact page</a>.</p>`,
  );
}
