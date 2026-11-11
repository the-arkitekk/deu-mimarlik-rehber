// Rehber: data.json'u okur, filtreler ve kartları çizer. Tüm metin textContent ile yazılır.
const $ = (s) => document.querySelector(s);
const kati = (s) => (s || "").toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "");
const durum = { arama: "", fakulte: "", bolum: "", acik: false, secili: new Set(), tumEtiketler: false };
let veri = { akademisyenler: [], cagrilar: [] };

function el(tag, nitelik = {}, ...cocuk) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(nitelik)) {
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v);
  }
  for (const c of cocuk) if (c) e.append(c);
  return e;
}
const guvenliUrl = (u, ...sema) => { try { return sema.includes(new URL(u).protocol) ? u : ""; } catch { return ""; } };

function liste(baslik, dizi) {
  if (!dizi.length) return null;
  const f = document.createDocumentFragment();
  f.append(el("dt", { text: baslik }), el("dd", {}, el("ul", {}, ...dizi.map((x) => el("li", { text: x })))));
  return f;
}

function kisiKarti(k) {
  const unvanlar = /^(prof\.?|doç\.?|dr\.?|öğr\.?|üyesi|arş\.?|gör\.?|örnek|–)$/i;
  const adlar = k.ad.split(/\s+/).filter((x) => x && !unvanlar.test(x));
  const bas3 = (adlar[0]?.[0] || "?") + (adlar.length > 1 ? adlar[adlar.length - 1][0] : "");
  const gorsel = k.foto && /^foto\/[\w.-]+$/.test(k.foto)
    ? el("img", { class: "avatar", src: k.foto, alt: "", loading: "lazy" })
    : el("div", { class: "avatar", "aria-hidden": "true", text: bas3 });
  const baglanti = el("div", { class: "baglantilar" });
  const av = guvenliUrl(k.avesis, "https:", "http:");
  if (av) baglanti.append(el("a", { href: av, rel: "noopener", target: "_blank", text: "AVESİS" }));
  const il = guvenliUrl(k.iletisim, "https:", "http:");
  if (il) baglanti.append(el("a", { href: il, rel: "noopener", target: "_blank", text: "İletişim" }));
  const ayrinti = el("details", {}, el("summary", { text: "Ayrıntılar" }),
    el("dl", {}, liste("Yöntemler", k.yontemler), liste("Proje deneyimi", k.proje_deneyimi), liste("Öne çıkan yayınlar / projeler", k.yayinlar)));
  return el("article", { class: "kart" },
    el("div", { class: "baslik" }, gorsel, el("div", {},
      el("h2", { text: k.ad }),
      el("div", { class: "alt-baslik" },
        el("span", { class: "rozet " + (k.bolum === "Mimarlık" ? "mim" : "sbp"), text: k.bolum }),
        k.taslak ? el("span", { class: "rozet kapali", text: "taslak · onaysız" }) : null,
        el("span", { class: "rozet " + (k.ortak_calismaya_acik ? "acik" : "kapali"), text: k.ortak_calismaya_acik ? "ortak çalışmaya açık" : "şu an kapalı" })))),
    k.ozet && el("p", { class: "ozet", text: k.ozet }),
    el("div", { class: "kelimeler" }, ...k.anahtar_kelimeler.map((x) => el("span", { text: x }))),
    ayrinti, baglanti.childNodes.length ? baglanti : null);
}

let esAnlamlilar = [];
// Profil metninde bir grup terimi geçiyorsa, grubun öteki terimlerini de arama metnine ekler (eş anlamlı / farklı yorum).
function saklaKisi(k) {
  const metin = kati([k.ad, k.bolum, k.ozet, ...k.anahtar_kelimeler, ...(k.otomatik_etiketler || []), ...(k.diger_alanlar || []),
    ...k.yontemler, ...k.proje_deneyimi, ...k.yayinlar].join(" | "));
  const ek = [];
  for (const grup of esAnlamlilar) {
    if (grup.some((t) => t.length > 3 && metin.includes(t))) ek.push(...grup);
  }
  return metin + " | " + ek.join(" ");
}

function cizKisiler() {
  const q = kati(durum.arama).split(/\s+/).filter(Boolean);
  const sonuc = veri.akademisyenler.filter((k) =>
    (!durum.fakulte || k.fakulte === durum.fakulte) && (!durum.bolum || k.bolum === durum.bolum) && (!durum.acik || k.ortak_calismaya_acik) &&
    [...durum.secili].every((e) => k.anahtar_kelimeler.includes(e)) && q.every((t) => k._ara.includes(t)));
  $("#durum").textContent = `${sonuc.length} akademisyen`;
  const kutu = $("#kartlar");
  kutu.replaceChildren(...(sonuc.length ? sonuc.map(kisiKarti) : [el("p", { class: "bos", text: "Eşleşen akademisyen bulunamadı." })]));
}

function cizEtiketler() {
  const sayac = new Map();
  veri.akademisyenler.forEach((k) => k.anahtar_kelimeler.forEach((e) => sayac.set(e, (sayac.get(e) || 0) + 1)));
  const sirali = [...sayac].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr")).map((x) => x[0]);
  const gorunen = durum.tumEtiketler ? sirali : sirali.slice(0, 14);
  const kutu = $("#etiketler");
  kutu.replaceChildren(...gorunen.map((e) => {
    const b = el("button", { class: "etiket", type: "button", "aria-pressed": String(durum.secili.has(e)), text: e });
    b.onclick = () => { durum.secili.has(e) ? durum.secili.delete(e) : durum.secili.add(e); cizEtiketler(); cizKisiler(); };
    return b;
  }));
  if (sirali.length > 14) {
    const b = el("button", { class: "etiket diger", type: "button", text: durum.tumEtiketler ? "Daha az göster" : `Tümü (${sirali.length})` });
    b.onclick = () => { durum.tumEtiketler = !durum.tumEtiketler; cizEtiketler(); };
    kutu.append(b);
  }
}

function cizCagrilar() {
  const bugun = new Date().toISOString().slice(0, 10);
  const liste_ = [...veri.cagrilar].sort((a, b) => (a.son_basvuru || "9").localeCompare(b.son_basvuru || "9"));
  $("#say-cagri").textContent = `(${liste_.length})`;
  const kutu = $("#cagrilar");
  if (!liste_.length) { kutu.replaceChildren(el("p", { class: "bos", text: "Şu an listelenen çağrı yok." })); return; }
  kutu.replaceChildren(...liste_.map((c) => {
    const kapali = c.son_basvuru && c.son_basvuru < bugun;
    const url = guvenliUrl(c.baglanti, "https:", "http:");
    return el("article", { class: "kart" },
      el("h2", { text: c.cagri_adi }),
      el("div", { class: "alt-baslik" }, c.kurum,
        " · son başvuru: " + (c.son_basvuru || "belirtilmemiş") + (kapali ? " (kapandı)" : ""),
        c.butce ? " · bütçe: " + c.butce : ""),
      c.ozet && el("p", { class: "ozet", text: c.ozet }),
      c.kapsam.length ? el("div", { class: "kelimeler" }, ...c.kapsam.map((x) => el("span", { text: x }))) : null,
      c.aranan_uzmanliklar.length ? el("div", { class: "alt-baslik", text: "Aranan uzmanlıklar: " + c.aranan_uzmanliklar.join(", ") }) : null,
      url ? el("div", { class: "baglantilar" }, el("a", { href: url, rel: "noopener", target: "_blank", text: "Çağrı sayfası" })) : null);
  }));
}

function sekmeler() {
  const sec = (ad) => {
    for (const k of ["kisi", "cagri"]) {
      $("#sek-" + k).setAttribute("aria-selected", String(k === ad));
      $("#panel-" + k).hidden = k !== ad;
    }
  };
  $("#sek-kisi").onclick = () => sec("kisi");
  $("#sek-cagri").onclick = () => sec("cagri");
}

// Fakülte seçici yalnızca birden fazla fakülte varsa görünür; bölüm listesi veriden üretilir.
function fakulteSecicileri() {
  const fakulteler = [...new Set(veri.akademisyenler.map((k) => k.fakulte).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
  const sec = $("#fakulte");
  sec.hidden = fakulteler.length < 2;
  fakulteler.forEach((f) => sec.append(el("option", { value: f, text: f })));
  bolumSecenekleri();
}
function bolumSecenekleri() {
  const bolumler = [...new Set(veri.akademisyenler.filter((k) => !durum.fakulte || k.fakulte === durum.fakulte).map((k) => k.bolum))].sort((a, b) => a.localeCompare(b, "tr"));
  const sec = $("#bolum");
  sec.replaceChildren(el("option", { value: "", text: "Tüm bölümler" }), ...bolumler.map((b) => el("option", { value: b, text: b })));
  sec.value = durum.bolum;
}

async function basla() {
  sekmeler();
  try {
    const r = await fetch("data.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    veri = await r.json();
  } catch {
    $("#durum").textContent = "Veri yüklenemedi. Lütfen sayfayı yenileyin.";
    return;
  }
  try {
    const r2 = await fetch("sozluk.json");
    if (r2.ok) esAnlamlilar = (await r2.json()).gruplar.map((g) => g.map(kati));
  } catch { /* sözlük yoksa düz arama */ }
  veri.akademisyenler.forEach((k) => { k._ara = saklaKisi(k); });
  $("#say-kisi").textContent = `(${veri.akademisyenler.length})`;
  $("#uretim").textContent = "Son güncelleme: " + veri.uretim;
  $("#ara").oninput = (e) => { durum.arama = e.target.value; cizKisiler(); };
  fakulteSecicileri();
  $("#fakulte").onchange = (e) => { durum.fakulte = e.target.value; durum.bolum = ""; bolumSecenekleri(); cizKisiler(); };
  $("#bolum").onchange = (e) => { durum.bolum = e.target.value; cizKisiler(); };
  $("#acik").onchange = (e) => { durum.acik = e.target.checked; cizKisiler(); };
  cizEtiketler(); cizKisiler(); cizCagrilar();
}
basla();
