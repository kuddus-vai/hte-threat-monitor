/**
 * AdSlot — vanilla TS equivalent of hte-portal's AdSlot.
 * Priority: Google AdSense unit → affiliate CTA → neutral "Sponsored" box.
 * Never breaks layout. Rendered into .ad-slot containers.
 */
const COPY: Record<string, string> = {
  ransomware: "Ransomware defense guides — isolate, back up, negotiate safely",
  phishing: "Phishing protection — spot the signs before you click",
  data_breach: "Breach response — check exposure & protect your accounts",
  vulnerability: "Patch management — close the gaps attackers target",
  malware: "Endpoint hardening — stop malware at the perimeter",
  apt: "Nation-state defense — threat modeling for high-value targets",
  outage: "Outage tracking tools & continuity planning resources",
  other: "Stay informed — verified threat updates and resources",
};

/** Dashboard sidebar ad copy (shorter, CTA style) */
const SIDEBAR_COPY: Record<string, string> = {
  vulnerability: "Free vuln scanner trial — scan your fleet in 5 min",
  news: "Threat intel briefings delivered daily — subscribe free",
  outage: "Uptime monitoring — get alerts before users notice",
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** Sidebar promo slot on the dashboard (below SIGNAL FILTERS). Zero-cost until AdSense approves. */
export function renderSidebarAd(container: HTMLElement, category: string): void {
  const client = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ADSENSE_CLIENT;
  if (client) {
    container.innerHTML = `
      <div class="sponsored">Sponsored</div>
      <ins class="adsbygoogle"
           style="display:block;width:100%;min-height:0"
           data-ad-client="${client}"
           data-ad-slot="1000000001"
           data-ad-format="vertical"
           data-full-width-responsive="true"></ins>`;
    setTimeout(() => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        /* ad block or no loader */
      }
    }, 50);
    return;
  }
  const copy = SIDEBAR_COPY[category] ?? SIDEBAR_COPY.news;
  const affiliate = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_AFFILIATE_URL;
  if (affiliate) {
    container.innerHTML = `<a class="sponsored sponsored-cta" href="${affiliate}" target="_blank" rel="noopener sponsored">${copy}</a>`;
    return;
  }
  container.innerHTML = `<div class="sponsored">${copy}</div>`;
}

export function renderAdSlot(container: HTMLElement, category: string): void {
  const client = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ADSENSE_CLIENT;
  if (client) {
    container.innerHTML = `
      <div class="sponsored">Advertisement</div>
      <ins class="adsbygoogle"
           style="display:block;width:100%;min-height:0;max-width:728px;margin:0 auto"
           data-ad-client="${client}"
           data-ad-slot="0000000000"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>`;
    // Push after DOM insert so the AdSense loader can fill it
    setTimeout(() => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        /* ad block or no loader — placeholder remains */
      }
    }, 50);
    return;
  }

  const affiliate = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_AFFILIATE_URL;
  const copy = COPY[category] ?? COPY.other;
  container.innerHTML = affiliate
    ? `<div class="sponsored">Sponsored</div>
       <a class="sponsor-link" href="${affiliate}" target="_blank" rel="sponsored noopener noreferrer">${copy}</a>`
    : `<div class="sponsored">Sponsored</div>
       <p class="sponsor-link">${copy}</p>`;
}
