import type { Locale } from "./i18n";

/** Interface copy. Content (products, categories, homepage) comes translated from the API. */
const en = {
  nav: { newArrivals: "New Arrivals", sale: "Sale", all: (name: string) => `All ${name.toLowerCase()}`, menu: "Menu", openMenu: "Open menu", closeMenu: "Close menu", main: "Main", search: "Search", account: "Account", wishlist: "Wishlist", bag: "Shopping bag", skip: "Skip to content", language: "Language", home: "Home", breadcrumb: "Breadcrumb" },
  wishlistCount: (n: number) => `Wishlist, ${n} item${n === 1 ? "" : "s"}`,
  home: { newArrivals: "New arrivals", collections: "The collections", mostWanted: "Most wanted", viewAll: "View all", shopEdit: "Shop the edit", readMore: "Read more", ourService: "Our service", featured: "Featured campaigns", chooseSlide: "Choose slide", showSlide: (i: number, n: number, h: string) => `Show slide ${i} of ${n}: ${h}`, slideOf: (i: number, n: number) => `${i} of ${n}` },
  card: { sale: "Sale price", original: "Original price", soldOut: "Sold out", save: (t: string) => `Save ${t} to wishlist`, remove: (t: string) => `Remove ${t} from wishlist`, availableIn: (c: string) => `Available in ${c}` },
  placeholder: { image: "Placeholder image", suffix: "placeholder — photograph to come", campaign: "Placeholder — campaign photograph (4:5, min. 2400 px tall)", editorial: "Placeholder — editorial photograph", lifestyle: "Placeholder — lifestyle photograph" },
  listing: {
    items: (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`,
    filters: "Filters", filter: "Filter", sortBy: "Sort by", clearAll: "Clear all", remove: (l: string) => `Remove filter: ${l}`,
    showResults: (n: number) => `Show ${n} ${n === 1 ? "result" : "results"}`,
    brand: "Brand", size: "Size", colour: "Colour", price: "Price", availability: "Availability", inStock: "In stock only", onSale: "On sale",
    min: "Min", max: "Max", apply: "Apply",
    sort: { relevance: "Best match", newest: "Newest", price_asc: "Price: low to high", price_desc: "Price: high to low", bestselling: "Bestselling" },
    empty: "Nothing matches these filters", emptyHint: "Try removing a filter or two to see more pieces.",
    page: (p: number, n: number) => `Page ${p} of ${n}`, prev: "Previous", next: "Next", pagination: "Pagination",
    subcategories: "Categories",
  },
  pages: {
    newTitle: "New arrivals", newIntro: "The latest pieces to arrive, updated every week.",
    saleTitle: "Sale", saleIntro: "Selected pieces at reduced prices, while sizes last.",
    searchTitle: "Search", searchPlaceholder: "Search for products, brands or SKUs", searchFor: (q: string) => `Results for “${q}”`,
    searchEmpty: (q: string) => `No results for “${q}”`, searchHint: "Check the spelling or try a more general word.", searchPrompt: "What are you looking for?",
  },
  product: {
    ref: "Ref.", colour: "Colour", size: "Size", selectSize: "Select a size", sizeGuide: "Size guide", quantity: "Quantity",
    addToBag: "Add to bag", chooseSize: "Choose a size first", unavailable: "Not available in this size",
    inStock: "In stock", lowStock: (n: number) => `Only ${n} left`, outOfStock: "Sold out in this size", soldOutAll: "Sold out",
    bagSoon: (sel: string) => `${sel} — the shopping bag is the next build phase, so items can't be added yet.`,
    decrease: "Decrease quantity", increase: "Increase quantity",
    description: "Description", composition: "Composition & care", delivery: "Delivery", returns: "Returns & exchanges",
    deliveryLine: (name: string, price: string, days: string) => `${name}: ${price}, ${days}`,
    free: "free", freeOver: (amount: string) => `free over ${amount}`, days: (min: number, max: number) => (min === max ? `${min} working day` + (min === 1 ? "" : "s") : `${min}–${max} working days`),
    methods: { standard: "Standard delivery", express: "Express delivery", regional: "Regional delivery" } as Record<string, string>,
    cod: "Cash on delivery available.",
    returnsText: (d: number) => `Free exchanges within ${d} days of delivery. Items must be unworn, with tags attached.`,
    related: "You may also like", oneSize: "One size", prevImage: "Previous image", nextImage: "Next image", gallery: "Product images", openImage: (i: number) => `Open image ${i} in full screen`, close: "Close", zoom: "Click to zoom",
    guideNote: { indicative: "Indicative conversion. Fit varies by brand and style — check the description for fit notes.", measureWaist: "Measure around your natural waist, keeping the tape comfortably loose.", measureFoot: "Stand on paper, mark heel and longest toe, and measure the distance." } as Record<string, string>,
    guideCols: { size: "Size", eu: "EU", it: "IT", uk: "UK", us: "US", waistIn: "Waist (in)", waistCm: "Waist (cm)", footCm: "Foot length (cm)" } as Record<string, string>,
  },
  newsletter: {
    title: (s: string) => `Letters from ${s}`, intro: "New arrivals, private sales and the occasional story. One e-mail a fortnight, at most.",
    email: "E-mail address", placeholder: "Your e-mail address", subscribe: "Subscribe", subscribing: "Subscribing…",
    consent: (s: string) => `I agree to receive ${s} news and offers by e-mail. You can unsubscribe at any time. Read our`, privacy: "privacy policy",
    done: "You’re subscribed. Look out for our next letter.", invalid: "Enter a valid e-mail address.", needConsent: "Tick the box to confirm you’d like our e-mails.",
    rate: "Too many attempts. Try again in a little while.", failed: "We couldn’t sign you up. Try again.", offline: "No connection. Check your internet and try again.",
  },
  footer: { shop: "Shop", care: "Customer care", about: "About", contact: "Contact us", shipping: "Shipping", returns: "Returns & exchanges", sizeGuide: "Size guide", account: "Your account", aboutUs: "About us", journal: "Journal", privacy: "Privacy policy", terms: "Terms & conditions", rights: "All rights reserved.", payments: "Payment methods", cod: "Cash on delivery", freeDelivery: (a: string, d: number) => `Free delivery in Montenegro on orders over ${a}. Free exchanges within ${d} days.` },
  errors: { notFound: "Page not found", notFoundText: "This page doesn’t exist or has moved. Try the latest arrivals, or use search to find a specific piece.", seeNew: "See new arrivals", backHome: "Back to home", failed: "This page didn’t load", failedText: "We couldn’t reach the store just now. Try again in a moment.", retry: "Try again" },
};

export type Messages = typeof en;

const me: Messages = {
  nav: { newArrivals: "Novo", sale: "Sniženje", all: (name: string) => `Sve — ${name.toLowerCase()}`, menu: "Meni", openMenu: "Otvori meni", closeMenu: "Zatvori meni", main: "Glavna navigacija", search: "Pretraga", account: "Nalog", wishlist: "Lista želja", bag: "Korpa", skip: "Preskoči na sadržaj", language: "Jezik", home: "Početna", breadcrumb: "Putanja" },
  wishlistCount: (n: number) => `Lista želja, artikala: ${n}`,
  home: { newArrivals: "Novo u ponudi", collections: "Kolekcije", mostWanted: "Najtraženije", viewAll: "Pogledaj sve", shopEdit: "Pogledaj izbor", readMore: "Pročitaj više", ourService: "Naše usluge", featured: "Istaknute kampanje", chooseSlide: "Izaberi slajd", showSlide: (i: number, n: number, h: string) => `Prikaži slajd ${i} od ${n}: ${h}`, slideOf: (i: number, n: number) => `${i} od ${n}` },
  card: { sale: "Snižena cijena", original: "Stara cijena", soldOut: "Rasprodato", save: (t: string) => `Sačuvaj ${t} na listu želja`, remove: (t: string) => `Ukloni ${t} sa liste želja`, availableIn: (c: string) => `Dostupno u bojama: ${c}` },
  placeholder: { image: "Privremena slika", suffix: "privremena slika — fotografija stiže", campaign: "Privremena slika — fotografija kampanje (4:5, min. 2400 px visine)", editorial: "Privremena slika — editorijalna fotografija", lifestyle: "Privremena slika — lifestyle fotografija" },
  listing: {
    items: (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "artikal" : "artikala"}`,
    filters: "Filteri", filter: "Filtriraj", sortBy: "Sortiraj", clearAll: "Obriši sve", remove: (l: string) => `Ukloni filter: ${l}`,
    showResults: (n: number) => `Prikaži rezultate (${n})`,
    brand: "Brend", size: "Veličina", colour: "Boja", price: "Cijena", availability: "Dostupnost", inStock: "Samo dostupno", onSale: "Na sniženju",
    min: "Od", max: "Do", apply: "Primijeni",
    sort: { relevance: "Najbolje poklapanje", newest: "Najnovije", price_asc: "Cijena: od najniže", price_desc: "Cijena: od najviše", bestselling: "Najprodavanije" },
    empty: "Nema artikala za izabrane filtere", emptyHint: "Uklonite neki od filtera da biste vidjeli više artikala.",
    page: (p: number, n: number) => `Strana ${p} od ${n}`, prev: "Prethodna", next: "Sljedeća", pagination: "Stranice",
    subcategories: "Kategorije",
  },
  pages: {
    newTitle: "Novo u ponudi", newIntro: "Najnoviji komadi, osvježeni svake sedmice.",
    saleTitle: "Sniženje", saleIntro: "Izabrani komadi po sniženim cijenama, dok ima veličina.",
    searchTitle: "Pretraga", searchPlaceholder: "Pretražite proizvode, brendove ili šifre", searchFor: (q: string) => `Rezultati za „${q}”`,
    searchEmpty: (q: string) => `Nema rezultata za „${q}”`, searchHint: "Provjerite pravopis ili pokušajte sa opštijim pojmom.", searchPrompt: "Šta tražite?",
  },
  product: {
    ref: "Šifra", colour: "Boja", size: "Veličina", selectSize: "Izaberite veličinu", sizeGuide: "Tabela veličina", quantity: "Količina",
    addToBag: "Dodaj u korpu", chooseSize: "Prvo izaberite veličinu", unavailable: "Nije dostupno u ovoj veličini",
    inStock: "Na stanju", lowStock: (n: number) => `Još samo ${n} kom.`, outOfStock: "Rasprodato u ovoj veličini", soldOutAll: "Rasprodato",
    bagSoon: (sel: string) => `${sel} — korpa je sljedeća faza izrade, pa artikli još ne mogu da se dodaju.`,
    decrease: "Smanji količinu", increase: "Povećaj količinu",
    description: "Opis", composition: "Sastav i održavanje", delivery: "Dostava", returns: "Povrat i zamjena",
    deliveryLine: (name: string, price: string, days: string) => `${name}: ${price}, ${days}`,
    free: "besplatno", freeOver: (amount: string) => `besplatno preko ${amount}`, days: (min: number, max: number) => (min === max ? `${min} radni dan` : `${min}–${max} radna dana`),
    methods: { standard: "Standardna dostava", express: "Ekspresna dostava", regional: "Regionalna dostava" },
    cod: "Moguće plaćanje pouzećem.",
    returnsText: (d: number) => `Besplatna zamjena u roku od ${d} dana od isporuke. Artikli moraju biti nenošeni, sa etiketama.`,
    related: "Možda će vam se dopasti", oneSize: "Univerzalna", prevImage: "Prethodna slika", nextImage: "Sljedeća slika", gallery: "Fotografije proizvoda", openImage: (i: number) => `Otvori sliku ${i} preko cijelog ekrana`, close: "Zatvori", zoom: "Kliknite za uvećanje",
    guideNote: { indicative: "Okvirna konverzija. Kroj se razlikuje po brendu i modelu — pogledajte opis proizvoda.", measureWaist: "Izmjerite obim prirodnog struka, sa trakom lagano opuštenom.", measureFoot: "Stanite na papir, označite petu i najduži prst i izmjerite razmak." },
    guideCols: { size: "Veličina", eu: "EU", it: "IT", uk: "UK", us: "US", waistIn: "Struk (inči)", waistCm: "Struk (cm)", footCm: "Dužina stopala (cm)" },
  },
  newsletter: {
    title: (s: string) => `Pisma iz ${s}`, intro: "Novi artikli, privatne rasprodaje i poneka priča. Najviše jedan e-mail u dvije sedmice.",
    email: "E-mail adresa", placeholder: "Vaša e-mail adresa", subscribe: "Prijavi se", subscribing: "Prijavljivanje…",
    consent: (s: string) => `Saglasan/na sam da primam ${s} novosti i ponude e-poštom. Možete se odjaviti u bilo kom trenutku. Pročitajte našu`, privacy: "politiku privatnosti",
    done: "Prijavljeni ste. Očekujte naše sljedeće pismo.", invalid: "Unesite ispravnu e-mail adresu.", needConsent: "Označite polje da potvrdite da želite naše e-mailove.",
    rate: "Previše pokušaja. Pokušajte ponovo malo kasnije.", failed: "Prijava nije uspjela. Pokušajte ponovo.", offline: "Nema konekcije. Provjerite internet i pokušajte ponovo.",
  },
  footer: { shop: "Kupovina", care: "Podrška kupcima", about: "O nama", contact: "Kontakt", shipping: "Dostava", returns: "Povrat i zamjena", sizeGuide: "Tabela veličina", account: "Vaš nalog", aboutUs: "O nama", journal: "Žurnal", privacy: "Politika privatnosti", terms: "Uslovi korišćenja", rights: "Sva prava zadržana.", payments: "Načini plaćanja", cod: "Plaćanje pouzećem", freeDelivery: (a: string, d: number) => `Besplatna dostava u Crnoj Gori za porudžbine preko ${a}. Besplatna zamjena u roku od ${d} dana.` },
  errors: { notFound: "Stranica nije pronađena", notFoundText: "Ova stranica ne postoji ili je premještena. Pogledajte novitete ili upotrijebite pretragu.", seeNew: "Pogledaj novo", backHome: "Nazad na početnu", failed: "Stranica se nije učitala", failedText: "Trenutno ne možemo da dođemo do prodavnice. Pokušajte ponovo za trenutak.", retry: "Pokušaj ponovo" },
};

export const MESSAGES: Record<Locale, Messages> = { en, me };
export const getMessages = (locale: Locale) => MESSAGES[locale];
