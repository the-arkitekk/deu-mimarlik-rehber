// Kavram (şemsiye terim) tabanlı arama. Tarayıcıda window.Arama, Node'da module.exports olarak kullanılır.
//
// Fikir: Akademide aynı kavram farklı adlarla geçer ("immersive VR" = "sürükleyici sanal gerçeklik").
//  1) Profil metinleri ve arama sorgusu kelime köklerine indirgenir (Türkçe ek farkları önemsizleşir).
//  2) veri/kavramlar.json'daki kavramların varyantları hem profilde hem sorguda aranır; ikisi aynı kavrama bağlanırsa eşleşir.
//  3) Kavramların üst kavramları vardır: alt kavramı olan profil üst kavramla da bulunur ("dijital tasarım" → VR, yapay zekâ, parametrik…).
//  4) Kavram dışında kalan sorgu kelimeleri düz (kök) eşleşmeyle aranır. Tüm koşulları sağlayan yoksa kısmi eşleşmeler gösterilir.
(function (g) {
  "use strict";

  const DURAK = new Set(("ve ile icin bir bu de da ki mi mu ya veya gibi daha en cok the of and in on for to a an with by from as at or is are").split(" "));

  function kati(s) {
    return String(s || "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase()
      .replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function belirtec(s) { return kati(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !DURAK.has(t)); }
  // Basit Türkçe kök yaklaşımı: ilk 5 karakter (ekler atılır). Kısa kelimeler olduğu gibi kalır.
  function kok(t) { return t.length > 5 ? t.slice(0, 5) : t; }
  // İki kök eşleşir: eşit ya da (≥4 harfli) biri diğerinin öneki ("kent" ~ "kents").
  function esles(a, b) {
    if (a === b) return true;
    if (a.length >= 4 && b.startsWith(a)) return true;
    if (b.length >= 4 && a.startsWith(b)) return true;
    return false;
  }
  function kokler(s) { return belirtec(s).map(kok); }
  function icerir(birimKokleri, v) { return birimKokleri.some((u) => esles(v, u)); }
  function hepsiVar(birimKokleri, varyantKokleri) { return varyantKokleri.length > 0 && varyantKokleri.every((v) => icerir(birimKokleri, v)); }

  // --- Kavram dizini
  function kavramDizini(kavramlar) {
    const dizin = { kavramlar: [], byId: new Map() };
    for (const k of kavramlar) {
      const varyantlar = [...new Set([k.ad, ...k.varyantlar])]
        .map((m) => ({ metin: m, kokler: kokler(m) })).filter((v) => v.kokler.length);
      const kv = { id: k.id, ad: k.ad, ust: Array.isArray(k.ust) ? k.ust : k.ust ? [k.ust] : [], varyantlar };
      dizin.kavramlar.push(kv);
      dizin.byId.set(kv.id, kv);
    }
    return dizin;
  }

  // --- Profil dizini: metin birimleri (ağırlıklı)
  function profilDizini(k, dizin) {
    const birimler = [];
    const ekle = (liste, agirlik) => (liste || []).forEach((m) => { const kk = kokler(m); if (kk.length) birimler.push({ metin: m, agirlik, kokler: kk }); });
    ekle(k.anahtar_kelimeler, 3); ekle(k.otomatik_etiketler, 3); ekle(k.diger_alanlar, 2); ekle(k.yontemler, 2);
    ekle(k.proje_deneyimi, 2); ekle(k.yayinlar, 1);
    (k.ozet ? k.ozet.split(/[.!?]+\s+/) : []).forEach((c) => ekle([c], 1.5));
    ekle([k.ad, k.bolum, k.anabilim_dali].filter(Boolean), 1);

    // Doğrudan kavram isabetleri
    const skor = new Map(); // id -> { skor, nedenler:Set }
    for (const kv of dizin.kavramlar) {
      let toplam = 0; const nedenler = [];
      for (const b of birimler) {
        if (kv.varyantlar.some((v) => hepsiVar(b.kokler, v.kokler))) { toplam += b.agirlik; nedenler.push(b); }
      }
      if (toplam > 0) skor.set(kv.id, { skor: Math.min(toplam, 12), dogrudan: true, nedenler });
    }
    // Üst kavramlara yayılım (alt kavramı olan, üstü de taşır)
    const yay = (id, deger, nedenler, derinlik) => {
      if (derinlik > 3) return;
      for (const u of dizin.byId.get(id).ust) {
        const mevcut = skor.get(u);
        const yeni = deger * 0.6;
        if (!mevcut) skor.set(u, { skor: yeni, dogrudan: false, nedenler });
        else if (!mevcut.dogrudan && yeni > mevcut.skor) { mevcut.skor = yeni; mevcut.nedenler = nedenler; }
        yay(u, yeni, nedenler, derinlik + 1);
      }
    };
    for (const [id, v] of [...skor]) if (v.dogrudan) yay(id, v.skor, v.nedenler, 0);

    const tumKokler = new Set(); birimler.forEach((b) => b.kokler.forEach((x) => tumKokler.add(x)));
    return { birimler, kavram: skor, tumKokler: [...tumKokler] };
  }

  // --- Sorgu çözümleme: hangi kavramlar anlaşıldı, geriye hangi kelimeler kaldı
  function sorguCozumle(q, dizin) {
    const tok = belirtec(q); const sk = tok.map(kok);
    let adaylar = []; // { id, ad, terim, idx:Set (bu kavramın kapsadığı sorgu kelimeleri) }
    for (const kv of dizin.kavramlar) {
      let enIyi = null; const idx = new Set();
      for (const v of kv.varyantlar) {
        if (!hepsiVar(sk, v.kokler)) continue;
        // Eşleşen her varyantın kelimeleri "anlaşıldı" sayılır (örn. "sarmal" + "sanal gerçeklik" aynı kavramın iki adı).
        sk.forEach((s, i) => { if (v.kokler.some((x) => esles(x, s))) idx.add(i); });
        if (!enIyi || v.kokler.length > enIyi.kokler.length) enIyi = v;
      }
      if (enIyi) adaylar.push({ id: kv.id, ad: kv.ad, terim: enIyi.metin, idx });
    }
    // Başka bir kavramın kapsadığı kelimelerin alt kümesini kapsayan kavramlar elenir ("sürdürülebilir turizm" varken tek başına "sürdürülebilir" gereksiz).
    const altKume = (a, b) => a.idx.size <= b.idx.size && [...a.idx].every((i) => b.idx.has(i)) && !(a.idx.size === b.idx.size && a.id <= b.id);
    adaylar = adaylar.filter((a) => !adaylar.some((b) => b !== a && altKume(a, b) && !(a.idx.size === b.idx.size)));
    const kapsanan = new Set(); adaylar.forEach((a) => a.idx.forEach((i) => kapsanan.add(i)));
    const anlasilan = adaylar.map(({ id, ad, terim }) => ({ id, ad, terim }));
    // Üst/alt çakışmasında yalnızca en özel kavramları koşul yap: bir kavramın alt kavramı da anlaşıldıysa üstü gereksiz.
    const idler = new Set(anlasilan.map((a) => a.id));
    const ustMu = (id, hedef, d = 0) => d < 4 && dizin.byId.get(id).ust.some((u) => u === hedef || ustMu(u, hedef, d + 1));
    const kosul = anlasilan.filter((a) => ![...idler].some((b) => b !== a.id && ustMu(b, a.id)));
    const kalan = sk.filter((_, i) => !kapsanan.has(i));
    return { kokler: sk, anlasilan, kosul, kalan };
  }

  // --- Arama
  function ara(q, profiller, dizin) {
    const cozum = sorguCozumle(q, dizin);
    const toplamKosul = cozum.kosul.length + cozum.kalan.length;
    if (!toplamKosul) return { cozum, sonuc: profiller.map((k) => ({ k, skor: 0, nedenler: [], kismi: false })), kismi: false };
    const degerlendir = (k) => {
      const pi = k._pi; let tamam = 0; let skor = 0; const nedenler = new Map();
      for (const a of cozum.kosul) {
        const v = pi.kavram.get(a.id);
        if (v) { tamam++; skor += v.skor * 2; v.nedenler.slice().sort((x, y) => y.agirlik - x.agirlik).slice(0, 2).forEach((b) => nedenler.set(b.metin, b.agirlik)); }
      }
      for (const t of cozum.kalan) {
        let best = 0; let bm = null;
        for (const b of pi.birimler) if (icerir(b.kokler, t) && b.agirlik > best) { best = b.agirlik; bm = b.metin; }
        if (best) { tamam++; skor += best; if (bm) nedenler.set(bm, best); }
      }
      return { k, tamam, skor, nedenler: [...nedenler.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]) };
    };
    const hepsi = profiller.map(degerlendir);
    let sonuc = hepsi.filter((r) => r.tamam === toplamKosul);
    let kismi = false;
    if (!sonuc.length && toplamKosul > 1) { sonuc = hepsi.filter((r) => r.tamam > 0); kismi = true; }
    sonuc.sort((a, b) => b.tamam - a.tamam || b.skor - a.skor);
    return { cozum, sonuc: sonuc.map((r) => ({ k: r.k, skor: r.skor, nedenler: r.nedenler, kismi })), kismi };
  }

  const API = { kati, belirtec, kok, esles, kokler, kavramDizini, profilDizini, sorguCozumle, ara };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else g.Arama = API;
})(typeof window !== "undefined" ? window : this);
