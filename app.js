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

function kisiKarti(k, nedenler = [], etiket = "Eşleşme") {
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
    el("dl", {}, liste("Yöntemler", k.yontemler), liste("Proje deneyimi", k.proje_deneyimi), liste("Öne çıkan projeler", k.projeler || []), liste("Öne çıkan yayınlar", k.yayinlar)));
  return el("article", { class: "kart" },
    el("div", { class: "baslik" }, gorsel, el("div", {},
      el("h2", { text: k.ad }),
      el("div", { class: "alt-baslik" },
        el("span", { class: "rozet " + (k.bolum === "Mimarlık" ? "mim" : "sbp"), text: k.bolum }),
        k.taslak ? el("span", { class: "rozet kapali", text: "taslak · onaysız" }) : null,
        k.onay_bekliyor
          ? el("span", { class: "rozet kapali", text: "AVESİS'ten otomatik · hoca onayı bekleniyor" })
          : el("span", { class: "rozet " + (k.ortak_calismaya_acik ? "acik" : "kapali"), text: k.ortak_calismaya_acik ? "ortak çalışmaya açık" : "şu an kapalı" })))),
    k.ozet && el("p", { class: "ozet", text: k.ozet }),
    nedenler.length ? el("div", { class: "neden", text: etiket + ": " + nedenler.join(" · ") }) : null,
    el("div", { class: "kelimeler" }, ...k.anahtar_kelimeler.map((x) => el("span", { text: x }))),
    k.onay_bekliyor ? el("div", { class: "neden", text: "Bu profil, hocanın AVESİS'te yayımladığı bilgilerden otomatik hazırlanmıştır; henüz hoca tarafından gözden geçirilmemiştir. Düzeltme veya kaldırma için fakülte koordinatörüne başvurulabilir." }) : null,
    ayrinti, baglanti.childNodes.length ? baglanti : null);
}

let kavramDizin = null;

function cizKisiler() {
  const uygun = veri.akademisyenler.filter((k) =>
    (!durum.fakulte || k.fakulte === durum.fakulte) && (!durum.bolum || k.bolum === durum.bolum) && (!durum.acik || k.ortak_calismaya_acik) &&
    [...durum.secili].every((e) => k.anahtar_kelimeler.includes(e)));
  const sorgu = durum.arama.trim();
  let liste = uygun.map((k) => ({ k, nedenler: [] })); let kismi = false; let cozum = null;
  if (sorgu && kavramDizin) {
    const r = window.Arama.ara(sorgu, uygun, kavramDizin);
    liste = r.sonuc.map((x) => ({ k: x.k, nedenler: x.nedenler })); kismi = r.kismi; cozum = r.cozum;
  }
  // "Anlaşılan kavramlar": kullanıcının yazdığı terim hangi kavrama bağlandı?
  const kutuA = $("#anlasilan");
  const ipuclari = cozum ? cozum.anlasilan.map((a) => (kati(a.terim) === kati(a.ad) ? a.ad : `${a.terim} → ${a.ad}`)) : [];
  kutuA.replaceChildren(...ipuclari.map((t) => el("span", { class: "kavram", text: t })));
  kutuA.hidden = !ipuclari.length;
  $("#durum").textContent = `${liste.length} akademisyen` + (kismi ? " · tüm kelimeleri birden karşılayan yok, kısmi eşleşmeler gösteriliyor" : "");
  const kutu = $("#kartlar");
  kutu.replaceChildren(...(liste.length ? liste.map((x) => kisiKarti(x.k, x.nedenler)) : [el("p", { class: "bos", text: "Eşleşen akademisyen bulunamadı." })]));
}

function cizEtiketler() {
  const sayac = new Map();
  veri.akademisyenler.forEach((k) => k.anahtar_kelimeler.forEach((e) => sayac.set(e, (sayac.get(e) || 0) + 1)));
  const sirali = [...sayac].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr")).map((x) => x[0]);
  const gorunen = durum.tumEtiketler ? sirali : sirali.slice(0, 3);
  const kutu = $("#etiketler");
  kutu.replaceChildren(...gorunen.map((e) => {
    const b = el("button", { class: "etiket", type: "button", "aria-pressed": String(durum.secili.has(e)), text: e });
    b.onclick = () => { durum.secili.has(e) ? durum.secili.delete(e) : durum.secili.add(e); cizEtiketler(); cizKisiler(); };
    return b;
  }));
  if (sirali.length > 3) {
    const b = el("button", { class: "etiket diger", type: "button", text: durum.tumEtiketler ? "Daha az göster" : `Diğer (${sirali.length - 3})` });
    b.onclick = () => { durum.tumEtiketler = !durum.tumEtiketler; cizEtiketler(); };
    kutu.append(b);
  }
}

const KAYNAK_ADLARI = { tubitak: "TÜBİTAK", ab: "Avrupa Komisyonu (Horizon vb.)", bap: "DEÜ BAP" };
function cizCagrilar() {
  const bugun = new Date().toISOString().slice(0, 10);
  const secili = ($("#cagri-kaynak") || {}).value || "";
  const hepsi = veri.cagrilar;
  const liste_ = hepsi.filter((c) => !secili || (c.kaynak || "elle") === secili)
    .sort((a, b) => (a.son_basvuru || "9").localeCompare(b.son_basvuru || "9"));
  $("#say-cagri").textContent = `(${hepsi.length})`;
  const kutu = $("#cagrilar");
  if (!liste_.length) { kutu.replaceChildren(el("p", { class: "bos", text: "Şu an listelenen çağrı yok." })); return; }
  kutu.replaceChildren(...liste_.map((c) => {
    const kapali = c.son_basvuru && c.son_basvuru < bugun;
    const url = guvenliUrl(c.baglanti, "https:", "http:");
    return el("article", { class: "kart" },
      el("h2", { text: c.cagri_adi }),
      c.otomatik ? el("div", {}, el("span", { class: "rozet kapali", text: "otomatik bulundu · resmî sayfadan doğrulayın" })) : null,
      el("div", { class: "alt-baslik" }, c.kurum,
        " · son başvuru: " + (c.son_basvuru || "belirtilmemiş") + (kapali ? " (kapandı)" : ""),
        c.butce ? " · bütçe: " + c.butce : ""),
      c.ozet && el("p", { class: "ozet", text: c.ozet }),
      c.kapsam.length ? el("div", { class: "kelimeler" }, ...c.kapsam.map((x) => el("span", { text: x }))) : null,
      c.aranan_uzmanliklar.length ? el("div", { class: "alt-baslik", text: "Aranan uzmanlıklar: " + c.aranan_uzmanliklar.join(", ") }) : null,
      el("div", { class: "baglantilar" },
        url ? el("a", { href: url, rel: "noopener", target: "_blank", text: "Çağrı sayfası" }) : null,
        (() => {
          const d = el("button", { type: "button", class: "dugme-link", text: "Bu çağrıya uygun ekibi bul" });
          d.onclick = () => {
            $("#ekip-metin").value = [c.cagri_adi, c.ozet, c.kapsam.join(". "), c.aranan_uzmanliklar.join(". "), c.notlar.join(". ")].filter(Boolean).join(". ");
            sekmeSec("ekip"); ekipCiz();
          };
          return d;
        })()));
  }));
}
function cagriKaynakSecici() {
  const kaynaklar = [...new Set(veri.cagrilar.map((c) => c.kaynak || "elle"))];
  const sec = $("#cagri-kaynak");
  sec.hidden = kaynaklar.length < 2;
  kaynaklar.forEach((k) => sec.append(el("option", { value: k, text: KAYNAK_ADLARI[k] || "Elle eklenen" })));
  sec.onchange = cizCagrilar;
}

let sekmeSec = () => {};
function sekmeler() {
  sekmeSec = (ad) => {
    for (const k of ["kisi", "cagri", "ekip"]) {
      $("#sek-" + k).setAttribute("aria-selected", String(k === ad));
      $("#panel-" + k).hidden = k !== ad;
    }
  };
  $("#sek-kisi").onclick = () => sekmeSec("kisi");
  $("#sek-cagri").onclick = () => sekmeSec("cagri");
  $("#sek-ekip").onclick = () => sekmeSec("ekip");
}

// Çağrıdan ekip önerisi: metin tarayıcıda işlenir (kavram katalogu + tamamlayıcı kapsama).
function ekipCiz() {
  const metin = $("#ekip-metin").value;
  const sonuc = $("#ekip-sonuc");
  if (!kavramDizin) { $("#ekip-durum").textContent = "Kavram kataloğu yüklenemedi."; return; }
  const aday = veri.akademisyenler.filter((k) => k.ortak_calismaya_acik);
  const r = window.Arama.ekipOner(metin, aday, kavramDizin);
  if (!r.kavramlar.length) {
    $("#ekip-durum").textContent = "Metinde tanıdığım bir konu bulunamadı. Daha ayrıntılı bir metin deneyin.";
    sonuc.hidden = true; return;
  }
  $("#ekip-durum").textContent = "";
  $("#ekip-kavramlar").replaceChildren(...r.kavramlar.map((c) => el("span", { class: "kavram" + (c.kapsam < 0.3 ? " eksik-k" : ""), text: c.ad })));
  const eksik = $("#ekip-eksik");
  eksik.hidden = !r.eksik.length;
  eksik.textContent = r.eksik.length ? "Fakültede yeterli uzman bulunamayan konular: " + r.eksik.join(", ") + ". Dış ortak gerekebilir." : "";
  $("#ekip-kartlar").replaceChildren(...(r.ekip.length ? r.ekip.map((x) => kisiKarti(x.k, x.katki, "Katkısı")) : [el("p", { class: "bos", text: "Bu çağrı için uygun bir ekip kurulamadı." })]));
  $("#ekip-alt-baslik").hidden = !r.alternatif.length;
  $("#ekip-alternatif").replaceChildren(...r.alternatif.map((x) => kisiKarti(x.k, x.katki, "Uyumlu konular")));
  sonuc.hidden = false;
}
function ekipBagla() {
  $("#ekip-form").onsubmit = (e) => { e.preventDefault(); ekipCiz(); };
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
    const r2 = await fetch("kavramlar.json");
    if (r2.ok) kavramDizin = window.Arama.kavramDizini((await r2.json()).kavramlar);
  } catch { /* kavram dosyası yoksa arama kavramsız çalışır */ }
  veri.akademisyenler.forEach((k) => { k._pi = kavramDizin ? window.Arama.profilDizini(k, kavramDizin) : null; });
  $("#say-kisi").textContent = `(${veri.akademisyenler.length})`;
  $("#uretim").textContent = "Son güncelleme: " + veri.uretim;
  $("#ara").oninput = (e) => { durum.arama = e.target.value; cizKisiler(); };
  fakulteSecicileri();
  $("#fakulte").onchange = (e) => { durum.fakulte = e.target.value; durum.bolum = ""; bolumSecenekleri(); cizKisiler(); };
  $("#bolum").onchange = (e) => { durum.bolum = e.target.value; cizKisiler(); };
  $("#acik").onchange = (e) => { durum.acik = e.target.checked; cizKisiler(); };
  ekipBagla(); cagriKaynakSecici(); cizEtiketler(); cizKisiler(); cizCagrilar();
}
basla();
