/**
 * Starter information pages. Created once (never overwritten), flagged
 * `needsReview` so the storefront shows a "being finalised" note until the
 * owner approves the text. Legal pages are drafts that describe how this
 * software actually handles data — they must be checked by a lawyer.
 *
 * Text uses the storefront's Markdown subset: ## headings, paragraphs,
 * "- " lists, **bold** and [links](/path). {{tokens}} are filled in from
 * Settings when the page is shown.
 */
import type { PrismaClient } from "../src/generated/prisma/client.js";

type Copy = { title: string; intro?: string; body: string; seoDescription?: string };
type PageSeed = { slug: string; kind: "STANDARD" | "CONTACT" | "SHIPPING" | "SIZE_GUIDE" | "LEGAL"; en: Copy; me: Copy };

export const PAGES: PageSeed[] = [
  {
    slug: "help/contact",
    kind: "CONTACT",
    en: {
      title: "Contact us",
      intro: "Questions about an order, sizing or a return? Write to us — we reply on working days.",
      body: `## Orders and deliveries
Please include your order number (it starts with MR-) so we can help faster.

## Opening hours
Monday to Friday, 9:00–17:00 (Montenegro time).`,
      seoDescription: "How to reach {{storeName}} customer service.",
    },
    me: {
      title: "Kontakt",
      intro: "Pitanja o porudžbini, veličini ili povraćaju? Pišite nam — odgovaramo radnim danima.",
      body: `## Porudžbine i dostava
Navedite broj porudžbine (počinje sa MR-) kako bismo vam brže pomogli.

## Radno vrijeme
Ponedjeljak–petak, 9:00–17:00.`,
      seoDescription: "Kako da kontaktirate korisničku podršku {{storeName}}.",
    },
  },
  {
    slug: "help/shipping",
    kind: "SHIPPING",
    en: {
      title: "Delivery",
      intro: "Delivery prices and times for each destination are listed below and are the same as at checkout.",
      body: `## When will my order ship?
Orders placed on a working day before 14:00 are usually handed to the courier the same or the next working day. You'll receive an e-mail with a tracking link when your parcel is on its way.

## Cash on delivery
Where shown, you can pay the courier in cash when the parcel arrives. Please have the exact amount ready.

## Problems with a delivery
If your parcel is damaged or something is missing, contact us within 48 hours of delivery at {{supportEmail}}.`,
      seoDescription: "Delivery prices, times and cash on delivery at {{storeName}}.",
    },
    me: {
      title: "Dostava",
      intro: "Cijene i rokovi dostave za svaku destinaciju navedeni su ispod i isti su kao na plaćanju.",
      body: `## Kada će moja porudžbina biti poslata?
Porudžbine primljene radnim danom do 14:00 obično predajemo kuriru istog ili narednog radnog dana. Kada paket krene, dobićete e-mail sa linkom za praćenje.

## Plaćanje pouzećem
Gdje je navedeno, možete platiti kuriru u gotovini pri preuzimanju. Molimo pripremite tačan iznos.

## Problem sa dostavom
Ako je paket oštećen ili nešto nedostaje, javite nam se u roku od 48 sati od preuzimanja na {{supportEmail}}.`,
      seoDescription: "Cijene i rokovi dostave i plaćanje pouzećem u {{storeName}}.",
    },
  },
  {
    slug: "help/returns",
    kind: "STANDARD",
    en: {
      title: "Returns and exchanges",
      intro: "You can return items within {{returnDays}} days of delivery without giving a reason.",
      body: `## How to return
- E-mail {{supportEmail}} with your order number and the items you're returning.
- Pack the items unworn, unwashed and with their labels attached.
- Send the parcel to the address we give you. Return delivery is paid by you unless the item is faulty or we sent the wrong one.

## Refunds
We refund the price of the returned items within 14 days of receiving them, using the payment method you used, or by bank transfer for cash-on-delivery orders.

## Exchanges
For a different size, return the item and place a new order — that way you get the size you want while it's in stock.

## Faulty items
If an item is faulty, contact us — we'll arrange a repair, replacement or refund in line with consumer protection law.`,
      seoDescription: "How to return or exchange an order from {{storeName}}.",
    },
    me: {
      title: "Povraćaj i zamjena",
      intro: "Artikle možete vratiti u roku od {{returnDays}} dana od preuzimanja, bez navođenja razloga.",
      body: `## Kako vratiti artikal
- Pošaljite e-mail na {{supportEmail}} sa brojem porudžbine i artiklima koje vraćate.
- Spakujte artikle nenošene, neoprane i sa etiketama.
- Pošaljite paket na adresu koju vam dostavimo. Troškove povratne dostave snosite vi, osim ako je artikal neispravan ili smo poslali pogrešan.

## Povraćaj novca
Iznos za vraćene artikle vraćamo u roku od 14 dana od prijema, istim načinom plaćanja, a za porudžbine plaćene pouzećem — uplatom na račun.

## Zamjena
Za drugu veličinu vratite artikal i napravite novu porudžbinu — tako dobijate željenu veličinu dok je na stanju.

## Neispravni artikli
Ako je artikal neispravan, javite nam se — obezbijedićemo popravku, zamjenu ili povraćaj novca u skladu sa zakonom o zaštiti potrošača.`,
      seoDescription: "Kako vratiti ili zamijeniti porudžbinu iz {{storeName}}.",
    },
  },
  {
    slug: "help/size-guide",
    kind: "SIZE_GUIDE",
    en: {
      title: "Size guide",
      intro: "Convert between size systems, or compare your measurements in centimetres. If you're between sizes, choose the larger one for a relaxed fit.",
      body: `## How to measure
- **Bust:** around the fullest part of the chest, keeping the tape horizontal.
- **Waist:** around the narrowest part of the waist.
- **Hips:** around the fullest part of the hips.
- **Foot:** stand on paper, mark heel and longest toe, and measure the distance.`,
      seoDescription: "Size charts for clothing and shoes at {{storeName}}.",
    },
    me: {
      title: "Tabela veličina",
      intro: "Uporedite sisteme veličina ili svoje mjere u centimetrima. Ako ste između dvije veličine, izaberite veću za komotniji kroj.",
      body: `## Kako da se izmjerite
- **Grudi:** oko najšireg dijela grudi, metar držite vodoravno.
- **Struk:** oko najužeg dijela struka.
- **Kukovi:** oko najšireg dijela kukova.
- **Stopalo:** stanite na papir, označite petu i najduži prst i izmjerite razmak.`,
      seoDescription: "Tabele veličina za odjeću i obuću u {{storeName}}.",
    },
  },
  {
    slug: "about",
    kind: "STANDARD",
    en: {
      title: "About us",
      intro: "{{storeName}} is a store for considered, contemporary clothing, shoes and accessories.",
      body: `## Our approach
We choose pieces for quality of material and make, and for how long they'll stay in your wardrobe — not for one season.

## Where we are
We're based in Montenegro and deliver across the country and the region.`,
    },
    me: {
      title: "O nama",
      intro: "{{storeName}} je prodavnica promišljene, savremene odjeće, obuće i aksesoara.",
      body: `## Naš pristup
Komade biramo po kvalitetu materijala i izrade i po tome koliko dugo ostaju u vašoj garderobi — ne samo jednu sezonu.

## Gdje smo
Nalazimo se u Crnoj Gori i dostavljamo širom zemlje i regiona.`,
    },
  },
  {
    slug: "help/privacy",
    kind: "LEGAL",
    en: {
      title: "Privacy policy",
      intro: "How {{companyName}} collects and uses personal data when you use this website.",
      body: `## Who is responsible
{{companyName}}, {{companyAddress}}, tax ID {{companyTaxId}} ("we") is responsible for your personal data. Contact: {{supportEmail}}.

## What we collect and why
- **Orders:** name, e-mail, phone, delivery address and the items you buy — to deliver your order, handle returns and meet accounting obligations.
- **Account:** if you register, your login details, saved addresses, order history and wishlist.
- **Newsletter:** your e-mail address and the time you agreed, only if you ticked the box. You can unsubscribe at any time.
- **Customer service:** messages you send us.

Payment card details are never stored by us; card payments, when offered, are handled by the payment provider.

## Who we share data with
Courier companies (to deliver), the payment provider (to take payment), our hosting and e-mail providers (to run the site), and authorities where the law requires it. We do not sell personal data.

## How long we keep it
Order and invoicing records for as long as tax law requires. Account data until you delete your account. Newsletter data until you unsubscribe.

## Cookies
This site uses only cookies it needs to work:
- **marea_sid** — keeps you signed in (if you sign in).
- **marea_cart** — remembers your bag.
- **marea_locale** — remembers your language.

We don't use advertising or analytics cookies. If that changes, we'll ask for your consent first.

## Your rights
You can ask to see, correct or delete your data, object to its use, or ask for a copy. Write to {{supportEmail}}. You can also complain to the Agency for Personal Data Protection and Free Access to Information of Montenegro.`,
      seoDescription: "How {{storeName}} handles personal data and cookies.",
    },
    me: {
      title: "Politika privatnosti",
      intro: "Kako {{companyName}} prikuplja i koristi lične podatke kada koristite ovaj sajt.",
      body: `## Ko je odgovoran
{{companyName}}, {{companyAddress}}, PIB {{companyTaxId}} („mi") odgovorni smo za vaše lične podatke. Kontakt: {{supportEmail}}.

## Šta prikupljamo i zašto
- **Porudžbine:** ime, e-mail, telefon, adresa za dostavu i artikli koje kupujete — da bismo isporučili porudžbinu, obradili povraćaj i ispunili računovodstvene obaveze.
- **Nalog:** ako se registrujete, podaci za prijavu, sačuvane adrese, istorija porudžbina i lista želja.
- **Newsletter:** vaša e-mail adresa i vrijeme saglasnosti, samo ako ste označili polje. Odjava je moguća u svakom trenutku.
- **Korisnička podrška:** poruke koje nam pošaljete.

Podatke o platnim karticama ne čuvamo; plaćanje karticom, kada je dostupno, obrađuje pružalac platnih usluga.

## Sa kim dijelimo podatke
Kurirske službe (radi dostave), pružalac platnih usluga (radi naplate), pružaoci hostinga i e-mail usluga (radi rada sajta) i nadležni organi kada to zakon nalaže. Lične podatke ne prodajemo.

## Koliko dugo ih čuvamo
Podatke o porudžbinama i računima onoliko koliko propisuju poreski propisi. Podatke naloga dok ne obrišete nalog. Podatke za newsletter dok se ne odjavite.

## Kolačići
Sajt koristi samo kolačiće neophodne za rad:
- **marea_sid** — čuva prijavu (ako se prijavite).
- **marea_cart** — pamti vašu korpu.
- **marea_locale** — pamti izabrani jezik.

Ne koristimo kolačiće za oglašavanje ni analitiku. Ako se to promijeni, prvo ćemo tražiti vašu saglasnost.

## Vaša prava
Možete tražiti uvid, ispravku ili brisanje podataka, uložiti prigovor na obradu ili zatražiti kopiju podataka. Pišite na {{supportEmail}}. Pritužbu možete podnijeti i Agenciji za zaštitu ličnih podataka i slobodan pristup informacijama Crne Gore.`,
      seoDescription: "Kako {{storeName}} obrađuje lične podatke i kolačiće.",
    },
  },
  {
    slug: "help/terms",
    kind: "LEGAL",
    en: {
      title: "Terms of sale",
      intro: "These terms apply to orders placed on this website.",
      body: `## Seller
{{companyName}}, {{companyAddress}}, tax ID {{companyTaxId}}, registration no. {{companyRegistrationNo}}. E-mail: {{supportEmail}}.

## Prices
Prices are in euros and include VAT. Delivery costs are shown before you confirm your order.

## Orders
Your order is accepted when you receive our order confirmation e-mail. If an item turns out to be unavailable, we'll contact you and refund any amount paid for it.

## Payment
Payment is cash on delivery where offered. Other payment methods are shown at checkout when available.

## Delivery
Delivery areas, prices and times are listed on the [Delivery](/help/shipping) page.

## Right of withdrawal
You may withdraw from the purchase within {{returnDays}} days of delivery without giving a reason. See [Returns and exchanges](/help/returns).

## Complaints
If a product is faulty, contact {{supportEmail}}. We handle complaints in line with Montenegrin consumer protection law.`,
      seoDescription: "Terms of sale for orders from {{storeName}}.",
    },
    me: {
      title: "Uslovi kupovine",
      intro: "Ovi uslovi važe za porudžbine napravljene na ovom sajtu.",
      body: `## Prodavac
{{companyName}}, {{companyAddress}}, PIB {{companyTaxId}}, matični broj {{companyRegistrationNo}}. E-mail: {{supportEmail}}.

## Cijene
Cijene su u eurima i uključuju PDV. Troškovi dostave prikazani su prije potvrde porudžbine.

## Porudžbine
Porudžbina je prihvaćena kada dobijete e-mail sa potvrdom. Ako neki artikal nije dostupan, kontaktiraćemo vas i vratiti uplaćeni iznos za njega.

## Plaćanje
Plaćanje je pouzećem gdje je ponuđeno. Ostali načini plaćanja prikazani su na plaćanju kada su dostupni.

## Dostava
Područja, cijene i rokovi dostave navedeni su na stranici [Dostava](/help/shipping).

## Pravo na odustanak
Od kupovine možete odustati u roku od {{returnDays}} dana od preuzimanja, bez navođenja razloga. Pogledajte [Povraćaj i zamjena](/help/returns).

## Reklamacije
Ako je proizvod neispravan, javite se na {{supportEmail}}. Reklamacije rješavamo u skladu sa zakonom o zaštiti potrošača Crne Gore.`,
      seoDescription: "Uslovi kupovine za porudžbine iz {{storeName}}.",
    },
  },
];

export async function seedPages(db: PrismaClient) {
  for (const p of PAGES) {
    if (await db.page.findUnique({ where: { slug: p.slug } })) continue;
    await db.page.create({
      data: {
        slug: p.slug,
        kind: p.kind,
        title: p.en.title,
        intro: p.en.intro ?? null,
        body: p.en.body,
        seoDescription: p.en.seoDescription ?? null,
        needsReview: true,
        translations: { create: { locale: "me", title: p.me.title, intro: p.me.intro ?? null, body: p.me.body, seoDescription: p.me.seoDescription ?? null } },
      },
    });
  }
}
