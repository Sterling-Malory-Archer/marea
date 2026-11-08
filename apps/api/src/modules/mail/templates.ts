import type { Locale } from "../../lib/i18n.js";

/** Minimal, accessible transactional e-mail layout (inline styles for mail clients). */
function layout(title: string, paragraphs: string[], cta: { label: string; url: string } | null, footer: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html><body style="margin:0;background:#F8F7F4;color:#202020;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:520px">
<tr><td style="font-family:Georgia,serif;font-size:22px;letter-spacing:.3em;padding-bottom:32px">MAREA</td></tr>
<tr><td style="font-family:Georgia,serif;font-size:28px;line-height:1.2;padding-bottom:20px">${esc(title)}</td></tr>
${paragraphs.map((p) => `<tr><td style="font-size:15px;line-height:1.6;padding-bottom:16px">${esc(p)}</td></tr>`).join("")}
${cta ? `<tr><td style="padding:12px 0 28px"><a href="${esc(cta.url)}" style="display:inline-block;background:#202020;color:#F8F7F4;text-decoration:none;padding:14px 24px;font-size:13px;letter-spacing:.08em">${esc(cta.label)}</a></td></tr>
<tr><td style="font-size:12px;color:#777;line-height:1.5;padding-bottom:24px;word-break:break-all">${esc(cta.url)}</td></tr>` : ""}
<tr><td style="font-size:12px;color:#777;border-top:1px solid #E5E2DC;padding-top:16px">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [title, "", ...paragraphs, ...(cta ? ["", `${cta.label}: ${cta.url}`] : []), "", footer].join("\n");
  return { html, text };
}

const copy = {
  en: {
    verify: { subject: "Confirm your e-mail address", title: "Confirm your e-mail", body: ["Thanks for creating a MAREA account. Confirm your e-mail address so we can send you order updates."], cta: "Confirm e-mail", note: "The link is valid for 48 hours. If you didn't create an account, ignore this e-mail." },
    reset: { subject: "Reset your password", title: "Reset your password", body: ["We received a request to reset the password for your MAREA account."], cta: "Choose a new password", note: "The link is valid for 1 hour and can be used once. If you didn't ask for this, ignore this e-mail — your password stays the same." },
    changed: { subject: "Your password was changed", title: "Your password was changed", body: ["The password for your MAREA account was just changed and you were signed out on other devices."], note: "If this wasn't you, reset your password straight away and contact us." },
    deletion: { subject: "We received your account deletion request", title: "Account deletion requested", body: ["We received your request to delete your MAREA account. We'll process it within 30 days and confirm by e-mail.", "Order records we're legally required to keep are retained, but separated from your personal profile."], note: "If you didn't make this request, contact us." },
  },
  me: {
    verify: { subject: "Potvrdite e-mail adresu", title: "Potvrdite e-mail adresu", body: ["Hvala što ste otvorili MAREA nalog. Potvrdite e-mail adresu kako bismo vam slali obavještenja o porudžbinama."], cta: "Potvrdi e-mail", note: "Link važi 48 sati. Ako niste otvorili nalog, zanemarite ovu poruku." },
    reset: { subject: "Promjena lozinke", title: "Promijenite lozinku", body: ["Primili smo zahtjev za promjenu lozinke za vaš MAREA nalog."], cta: "Izaberi novu lozinku", note: "Link važi 1 sat i može se iskoristiti jednom. Ako niste tražili promjenu, zanemarite poruku — lozinka ostaje ista." },
    changed: { subject: "Lozinka je promijenjena", title: "Lozinka je promijenjena", body: ["Lozinka za vaš MAREA nalog je upravo promijenjena i odjavljeni ste sa drugih uređaja."], note: "Ako to niste bili vi, odmah promijenite lozinku i kontaktirajte nas." },
    deletion: { subject: "Primili smo zahtjev za brisanje naloga", title: "Zatražili ste brisanje naloga", body: ["Primili smo vaš zahtjev za brisanje MAREA naloga. Obradićemo ga u roku od 30 dana i potvrditi e-mailom.", "Podaci o porudžbinama koje smo zakonski dužni da čuvamo ostaju sačuvani, ali odvojeni od vašeg ličnog profila."], note: "Ako niste poslali ovaj zahtjev, kontaktirajte nas." },
  },
} as const;

type Kind = keyof (typeof copy)["en"];

export function renderEmail(kind: Kind, locale: Locale, url?: string) {
  const c = copy[locale][kind] as { subject: string; title: string; body: readonly string[]; cta?: string; note: string };
  const { html, text } = layout(c.title, [...c.body], c.cta && url ? { label: c.cta, url } : null, c.note);
  return { subject: c.subject, html, text };
}
