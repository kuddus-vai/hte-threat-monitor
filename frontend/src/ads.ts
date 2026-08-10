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

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function renderAdSlot(container: HTMLElement, category: string): void {
  const client = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ADSENSE_CLIENT;
  if (client) {
    container.innerHTML = `
      <div class="sponsored">Advertisement</div>
      <ins class="adsbygoogle"
           style="display:block;min-height:90px;max-width:728px;margin:0 auto"
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
