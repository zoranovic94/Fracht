// ==UserScript==
// @name         Timocom Fracht-Wächter (MZ Transport)
// @namespace    https://www.mz-transport.de/
// @version      12.6
// @description  Meldet neue, lohnende Frachten aus deiner Timocom-Suche per Push aufs Handy – mit Kostenrechnung, Zeitprüfung, Rückladungs-Check, Kontaktdaten und LKW-Position aus RIO.
// @match        https://my.timocom.com/*
// @match        https://iam.timocom.com/*
// @match        https://livemonitor.rio.cloud/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @noframes
// @updateURL    https://zoranovic94.github.io/Fracht/waechter.meta.js
// @downloadURL  https://zoranovic94.github.io/Fracht/waechter.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ============================ FESTE EINSTELLUNGEN ============================
  const CONFIG = {
    // Kanal in der ntfy-App. Nicht weitergeben: Wer den Namen kennt, kann mitlesen.
    NTFY_KANAL: '',
    NTFY_SERVER: 'https://ntfy.sh',
    MAX_MELDUNGEN_AUF_EINMAL: 8,  // so viele Meldungen je Aktualisierung – der Rest kommt eine Runde später
    MAX_PRUEFUNGEN_AUF_EINMAL: 15, // so viele neue Angebote pro Aktualisierung werden genau geprüft
    WARNUNG_NACH_MINUTEN: 5,      // so lange keine neue Liste: Warnung aufs Handy
    NEUSTART_NACH_MINUTEN: 15,    // nach so einer Pause werden vorhandene Angebote still übernommen …
    NACHHOLEN_BIS_MINUTEN: 240,   // … außer die Pause war kürzer (z. B. abgemeldet): dann werden alle neuen nachträglich geprüft
    LOGIN_WARNUNG_MINUTEN: 2,     // so lange auf der Login-Seite: Warnung „abgemeldet“
    // Schonender Betrieb: wenige eigene Abfragen bei Timocom, mit Pausen
    PAUSE_ZWISCHEN_ABFRAGEN_MS: 4000, // 4 Sekunden zwischen zwei eigenen Abfragen
    MAX_ABFRAGEN_PRO_STUNDE: 250,  // Ersatzwert – eingestellt wird das unter ⚙ Einstellungen (maxAbfragenProStunde)
    RESERVE_FUER_KONTAKTE: 80,    // so viele Abfragen pro Stunde bleiben immer für Kontaktdaten (Telefon, E-Mail) frei
    MAX_RUECK_CHECKS_PRO_LISTE: 5, // je Aktualisierung höchstens so viele Rückladungs-Checks (die besten zuerst) – so viele, wie einzeln gemeldet werden
    RUECK_CACHE_MINUTEN: 60,      // Ergebnis eines Rückladungs-Checks je Region so lange wiederverwenden
    TOP_JE_REITER: 2,             // Knopf „Beste je Reiter“: so viele Angebote je Reiter
    TOP_MAX_PRUEFUNGEN: 8,        // … und insgesamt höchstens so viele Angebote genauer prüfen
    TESTMODUS: false,             // true = nichts senden, nur in der Browser-Konsole anzeigen
  };

  // Diese Werte kannst du im roten Kasten unter „Einstellungen“ ändern.
  const STANDARD = {
    kostenProKm: 1.00,       // € je gefahrenem km (leer + beladen)
    fixkostenProTag: 220,    // € Fixkosten je Einsatztag
    toleranz: 5,             // % Puffer: so knapp unter der Grenze gilt noch als 🟡 und wird gemeldet (95 % statt 100 %)
    knappAb: 90,             // 🤏 % – Touren zwischen hier und der Grenze trotzdem melden: still, mit Preisvorschlag zum Nachverhandeln (0 = aus)
    standorte: 'Rheinberg: 51.552, 6.597; Oberhausen: 51.5011, 6.8495', // wo die LKW stehen – ohne RIO rechnet er ab dem nächsten davon
    minDeckung: 100,         // % – ab dieser Kostendeckung wird gemeldet (darunter 🔴 – lohnt nicht)
    minEuroKm: 1.0,          // € je gefahrenem km (leer + beladen) – darunter nie melden
    mindestensEinTag: true,  // jede Ladung muss mindestens einen Tagessatz decken
    volleTage: true,         // jeder angefangene Einsatztag (Schicht) kostet den vollen Tagessatz – laden heute, entladen morgen = 2 Tage
    folgetourAnteil: 50,     // % Tagessatz für weitere Touren an einem Tag, an dem schon eine Tour gefahren wurde (Knopf im Kasten)
    stundenProTag: 12,       // so viele Einsatzstunden zählen als ein Tag
    kmh: 60,                 // Schnitt auf der Straße
    ladezeit: 1.5,           // Stunden fürs Beladen
    entladezeit: 1.5,        // Stunden fürs Entladen
    pufferMin: 60,           // Min. – so viel zu spät zum Lade-/Entladeschluss gilt noch als „knapp, Dispo fragen“
    umwegFaktor: 1.3,        // Luftlinie → Straßen-km für die Anfahrt (nur wenn keine LKW-Route berechnet wurde)
    lkwRouting: true,        // Leer-km als echte LKW-Route (40 t, 4 m hoch) über openrouteservice berechnen
    orsKey: 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjdkNTIyODdiMjc2MzRlMmI4NGQ1OGI4NjhiY2VlZTgwIiwiaCI6Im11cm11cjY0In0=', // Schlüssel für openrouteservice (kostenlos)
    orsProTag: 180,          // höchstens so viele LKW-Routen am Tag (kostenloses Kontingent schonen)
    ohnePreisMelden: true,   // Angebote ohne Preis melden (mit deinem Mindestpreis)
    ntfyKanal: '',           // ntfy-Kanal – steht nur hier am PC, nicht im Update-Skript
    ntfyToken: '', // Zugangs-Token vom ntfy-Abo (tk_…) – damit 2.500 statt ca. 250 Meldungen am Tag, 🔵 wieder einzeln
    preisSammelMin: 60,      // 🔵 Angebote ohne Preis: alle so viele Minuten als eine Sammelmeldung (0 = einzeln wie früher)
    ohnePreisAbLdm: 7,       // … aber nur ab so vielen Lademetern (kleine Teilladungen decken keinen Tagessatz)
    rueckCheck: true,        // Rückladungen am Zielort prüfen
    rueckRadius: 75,         // km Umkreis um den Zielort
    rueckPflichtAbKm: 250,   // ↩ Ziel so weit (Luftlinie) von zu Hause: Rückweg wird IMMER geprüft, bevor gemeldet wird (0 = aus)
    rueckSchlechtNurAb: 130, // % – bei schlechter Rückladung nur melden, wenn so gut bezahlt
    heimName: 'Duisburg',    // ↩ Rückladung zählt nur, wenn sie zurück Richtung Heimat geht
    heimKoord: '51.4344, 6.7623', // Heimat als Breite, Länge (Duisburg)
    heimRadius: 100,         // km – endet die Rückladung so nah an der Heimat (oder bringt dich mindestens halb so nah heran), zählt sie.
                             // Liegt schon das Ziel der Tour so nah, ist die Rückladung egal: dann geht es leer heim.
    kontaktAbrufen: true,    // Ansprechpartner und Telefon in die Meldung
    maxAbfragenProStunde: 250,
    aktivVon: 0,             // Arbeitszeit: ab so viel Uhr meldet und fragt der Wächter (gleicher Wert bei „bis“ = rund um die Uhr)
    aktivBis: 0,            // … bis so viel Uhr. Danach ruht er; zu Beginn der Arbeitszeit kommen die besten Angebote der Nacht // eigene Abfragen bei Timocom je Stunde (Kontakt + Rückladung) – danach Meldungen ohne beides
    freiAb: '',              // „JJJJ-MM-TTTHH:MM“ – leer = LKW ist jetzt frei
    // Kanäle („Reiter“ in der ntfy-App)
    heuteFertigBis: 24,      // ☀️ Heute leer: Entladung fertig bis so viel Uhr (24 = bis Mitternacht, also 23:59)
    heuteMaxLeerKm: 80,      // ☀️ … Anfahrt höchstens so weit
    heuteMaxLastKm: 250,     // ☀️ … Tour höchstens so lang
    heuteOhnePreisAlle: true, // ☀️ Angebote ohne Preis auch unter 7 Lademetern zeigen
    zusatzMinDeckung: 100,   // ☀️/🌙 Zusatztouren melden ab so viel Deckung
    fernAbKm: 300,           // 🛣️ Fernverkehr: ab so vielen Last-km
    fernMinDeckung: 110,     // 🛣️ … und mindestens so viel Deckung (starker Preis)
    nachtLadenAb: 0,         // 🌙 Nachttour: Beladen heute ab so viel Uhr (0 = egal wann, auch vormittags)
    nachtAbendsAb: 18,       // 🌙 … Entladung abends oder nachts: fertig ab so viel Uhr
    nachtFertigBis: 7,       // 🌙 … und spätestens so viel Uhr am nächsten Morgen
    zusatzOhneTagessatz: false, // false = jede Ladung trägt den vollen Fahrer-Tagessatz · true = ☀️/🌙/🔁 nur anteilig
    // 🔁 Nacht + zurück: nachmittags laden, nachts entladen, leer zurück zum Standort – und trotzdem kostendeckend
    rundLadenAb: 12,         // 🔁 Beladen heute ab so viel Uhr
    rundZurueckBis: 10,      // 🔁 wieder am Standort bis so viel Uhr am nächsten Morgen
    rundMinDeckung: 100,     // 🔁 Deckung inklusive Leerfahrt zurück
    // Sonstiges
    auslandAusschliessen: true, // nur Firmen aus den erlaubten Ländern melden
    erlaubteLaender: 'DE,AT,NL', // Firmensitz in diesen Ländern ist ok
    nurDeutschland: true,    // nur Touren, bei denen alle Lade- und Entladestellen in Deutschland liegen
    maxGewicht: 25,          // t Nutzlast – schwerere Ladungen nie melden
    maxLadestellen: 2,       // Touren mit mehr Ladestellen nie melden (0 = egal)
    maxEntladestellen: 2,    // Touren mit mehr Entladestellen nie melden (0 = egal)
    gefahrgutAusschliessen: true, // kein ADR: Touren nie melden, in denen Gefahrgut/ADR steht (auch nur in der Bemerkung) – „kein ADR“ zählt nicht
    ausschlussWoerter: 'Übermaß, Überbreite, Überlänge, Überhöhe, verbreiterbar, Verbreiterung, ausziehbar, Teleskop, Tieflader, A-Schild, A Schild, A-Tafel', // steht eins davon im Angebot → nicht melden
    sperrFirmen: '',         // diese Firmen nie melden (Namensteile, mit Komma getrennt)
    stammFirmen: '',         // Stammkunden: immer melden, auch unter der Deckungsgrenze (🤝)
    zahlungszielWarnAb: 45,  // Tage – längeres Zahlungsziel bekommt ⚠️
    mailTelefon: '', // Rückrufnummer im Text der E-Mail-Anfrage
    mailSignatur: '',        // Text-Signatur unter der E-Mail – leer: die Mail-App hängt deine echte Signatur (mit Logo und Bild) an // Signatur unter der vorbereiteten E-Mail
    veralteteLoeschen: true, // weggefallene Angebote aus der App löschen (Android ja – die iPhone-App macht daraus leere Einträge)
    kompakt: true,           // kurze Meldungen (wenige Zeilen) statt ausführlich
    appLink: 'https://zoranovic94.github.io/Fracht/',
    stummWennAppOffen: true, // Ist die Fracht-App auf dem Handy offen (Glocke an), kommen ntfy-Meldungen ohne Ton – die App piept selbst // Antippen einer Meldung öffnet diese Tour in der Fracht-App (leer = ntfy-App)
    timocomAufbau: false,    // Meldungen aufgebaut wie ein Timocom-Angebot (aus: kurze Meldungen mit Symbolen wie gewohnt) (Laden, Entladen, Fracht, Preis, Firma, Kontakt)
    kuerzenFuerGoogle: true, // Meldungen unter 4 KB halten (Google/Firebase schneidet sonst ab) – aus, wenn in ntfy „Sofortige Zustellung“ an ist
    logoUrl: '',             // Bild neben jeder Meldung (aus – sonst sieht es aus, als käme das Angebot von euch)
    // Farben: 🥇 Gold · 🟢 sehr gut · 🟡 geht so · 🔴 lohnt nicht (nach Kostendeckung)
    goldAb: 150,             // % Deckung für 🥇 Gold – die richtig lukrativen Touren
    gruenAb: 120,            // % Deckung für 🟢
    gelbAb: 100,             // % Deckung für 🟡 – darunter 🔴
    heimfahrtEinrechnen: true, // Kurze Touren, nach denen der LKW noch am selben Tag zurück am Standort ist: Leerfahrt heim zählt zu den Kosten …
    heimfahrtAb: 14,         // … aber nur, wenn die Entladung erst ab dieser Uhrzeit fertig ist (vorher folgt meist noch eine Ladung)
    tagestourGruenAb: 100,   // % – Laden + Entladen am selben Tag: 🟢, wenn inkl. Leerfahrt zurück zum Standort so viel gedeckt
    tabelleFaerben: true,    // Timocom-Liste am PC einfärben
  };
  // Zwei Kanäle in der ntfy-App, getrennt nach Ladetag: ⚡ Heute laden (…-heute) und 📅 Ab morgen laden (Hauptkanal, dazu Warnungen).
  // Die Art der Tour steht als Symbol im Titel.
  // 🔐 Kanal, Token und Telefonnummer stehen nur in der einmal von Hand eingespielten Fassung. Die automatischen Updates
  // kommen ohne sie und lesen sie aus dem Speicher dieses Browsers – so steht nichts davon öffentlich im Netz.
  (function geheimes() {
    try {
      const alt = JSON.parse(localStorage.getItem('mzw_geheim') || '{}') || {};
      const ein = JSON.parse(localStorage.getItem('mzw_einst') || '{}') || {};
      const neu = { kanal: CONFIG.NTFY_KANAL || String(ein.ntfyKanal || '').trim() || alt.kanal || '',
        token: STANDARD.ntfyToken || alt.token || '', tel: STANDARD.mailTelefon || alt.tel || '' };
      if (JSON.stringify(neu) !== JSON.stringify(alt)) localStorage.setItem('mzw_geheim', JSON.stringify(neu));
      CONFIG.NTFY_KANAL = neu.kanal; STANDARD.ntfyKanal = neu.kanal; STANDARD.ntfyToken = neu.token; STANDARD.mailTelefon = neu.tel;
    } catch (e) { /* egal */ }
  })();
  const KANAL_HEUTE = CONFIG.NTFY_KANAL + '-heute', KANAL_SPAETER = CONFIG.NTFY_KANAL, KANAL_PREIS = CONFIG.NTFY_KANAL + '-preis';
  const KANAELE = {
    heute: { kanal: KANAL_HEUTE, symbol: '☀️', name: 'Heute leer' },
    rund: { kanal: KANAL_HEUTE, symbol: '🔁', name: 'Nacht + zurück' },
    nacht: { kanal: KANAL_HEUTE, symbol: '🌙', name: 'Nacht' },
    fern: { kanal: KANAL_SPAETER, symbol: '🛣️', name: 'Fern' },
    sonst: { kanal: KANAL_SPAETER, symbol: '📋', name: 'Weitere' },
  };
  // Kanal: ohne Preis → 🔵 Preis abklären; mit Preis nach Ladetag: heute → ⚡ Heute laden, sonst → 📅 Ab morgen laden
  const kanalFuer = (b) => (b && b.deckung === null ? KANAL_PREIS
    : b && b.ankunftLaden && new Date(b.ankunftLaden).toDateString() === new Date().toDateString() ? KANAL_HEUTE : KANAL_SPAETER);
  const artSymbol = (kat) => (kat && kat !== 'sonst' && KANAELE[kat] ? KANAELE[kat].symbol + ' ' : '');
  const FARBEN = {
    gold: { bg: '#f5c542', rand: '#8a6d00', symbol: '🥇', name: 'Gold', prio: 5, fett: true },
    gruen: { bg: '#dcf5e1', rand: '#2e7d32', symbol: '🟢', name: 'sehr gut', prio: 5 },
    gelb: { bg: '#fff3bf', rand: '#e0a800', symbol: '🟡', name: 'geht so', prio: 4 },
    orange: { bg: '#ffcdd2', rand: '#c62828', symbol: '🔴', name: 'lohnt nicht', prio: 2 }, // rot, leise, ohne Ton
    anfrage: { bg: '#d6e8ff', rand: '#1565c0', symbol: '🔵', name: 'Preis abklären', prio: 4 }, // ohne Preis, aber passt
    aus: { bg: '', rand: '#bdbdbd', symbol: '', name: 'ausgeblendet', prio: 3 }, // ausländische Firma: blass
  };
  // ===========================================================================

  if (window.__mzWaechter) return;
  window.__mzWaechter = true;

  const MIN = 60 * 1000;
  const STD = 60 * MIN;
  const origFetch = window.fetch ? window.fetch.bind(window) : null;
  // Eigene Abfragen (Timocom-Details, LKW-Route, ntfy) mit Frist: eine hängende Verbindung darf nie die ganze Prüfung blockieren
  const FRIST_MS = 45 * 1000;
  function meinFetch(url, opt) {
    if (!CONFIG.NTFY_KANAL && String(url).indexOf(CONFIG.NTFY_SERVER) === 0) return Promise.reject(new Error('Kein ntfy-Kanal eingetragen'));
    const o = Object.assign({}, opt || {});
    if (!o.signal && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) o.signal = AbortSignal.timeout(FRIST_MS);
    return origFetch(url, o);
  }

  // ntfy-Abo: mit Token zählen die Meldungen auf dein Konto (2.500 am Tag) statt auf die Internetadresse (ca. 250)
  // Lehnt ntfy den Token ab (401/403), wird dieser Token nicht mehr benutzt: Meldungen gehen dann ohne Abo raus (ca. 250/Tag),
  // bis ein neuer Token in den Einstellungen steht.
  function tokenRoh() { try { return String(einst.ntfyToken || '').trim(); } catch (e) { return ''; } }
  function tokenKaputt() { try { return !!tokenRoh() && localStorage.getItem('mzw_ntfyTokenKaputt') === tokenRoh(); } catch (e) { return false; } }
  function ntfyToken() { return tokenKaputt() ? '' : tokenRoh(); }
  function tokenAbgelehnt() {
    const t = tokenRoh();
    if (!t || tokenKaputt()) return;
    try { localStorage.setItem('mzw_ntfyTokenKaputt', t); } catch (e) { /* egal */ }
    console.warn('[Fracht-Wächter] ntfy lehnt den Token ab – sende ohne Abo weiter');
    sende('⚠️ ntfy-Abo: Token ungültig',
      'ntfy nimmt den Token vom Abo nicht mehr an. Meldungen kommen weiter, aber ohne Abo (ca. 250 am Tag, Touren ohne Preis stündlich gesammelt). ' +
      'Bitte auf ntfy.sh/app unter „Konto“ einen neuen Zugriffstoken erstellen und im Wächter unter ⚙ Einstellungen eintragen.', 4, 'warning');
    try { zeichne(); } catch (e) { /* egal */ }
  }
  function ntfyHeaders(h) { const t = ntfyToken(); return t ? Object.assign({ 'Authorization': 'Bearer ' + t }, h || {}) : (h || {}); }
  // 💚 Lebenszeichen für die Frachtradar-App (Kanal …-pc): Läuft der Wächter, ist Timocom angemeldet, kommt die Suchliste?
  // Die App zeigt danach „Live“ nur, wenn hier wirklich alles läuft – sonst „PC offline“, „Timocom abgemeldet“ oder „Liste steht“.
  const WAECHTER_VERSION = '12.6';
  const TAB_ID = Math.random().toString(36).slice(2, 8); // mehrere Timocom-Tabs auseinanderhalten
  function pcMelden(d) {
    if (!origFetch || CONFIG.TESTMODUS) return Promise.resolve(true);
    try { zaehleNtfy(); } catch (e) { /* auf der Login-Seite gibt es keinen Zähler */ }
    return meinFetch(CONFIG.NTFY_SERVER + '/' + encodeURIComponent(CONFIG.NTFY_KANAL + '-pc'), { method: 'POST', headers: ntfyHeaders(),
      body: JSON.stringify(Object.assign({ v: WAECHTER_VERSION, t: Date.now(), tab: TAB_ID }, d)) }).then((r) => r.ok).catch(() => false);
  }
  const ntfyLimit = () => (state && state.ntfyServer && state.ntfyServer.grenze) || (ntfyToken() ? 2500 : 250);
  const ntfyReserve = () => ntfyLimit() - 60; // die letzten 60 Nachrichten bleiben für neue Angebote, Löschen pausiert
  const sammelAktiv = () => { try { return Number(einst.preisSammelMin) > 0 && !ntfyToken(); } catch (e) { return false; } };
  function sende(titel, text, prio, tag, extra) {
    const nachricht = Object.assign({
      topic: CONFIG.NTFY_KANAL,
      title: titel,
      message: text,
      priority: prio || 3,
      tags: tag ? [tag] : [],
    }, extra || {});
    try { const logo = String(einst.logoUrl || '').trim(); if (/^https?:\/\/\S+$/i.test(logo)) nachricht.icon = logo; } catch (e) { /* Login-Seite: keine Einstellungen */ }
    try { if (einst.kuerzenFuerGoogle !== false) passendMachen(nachricht); } catch (e) { passendMachen(nachricht); }
    if (CONFIG.TESTMODUS) {
      console.log('[Fracht-Wächter TEST]', titel + '\n' + text, extra || '');
      (window.__mzwTestLog = window.__mzwTestLog || []).push(nachricht);
      return Promise.resolve(true);
    }
    if (!origFetch) return Promise.resolve(false);
    try { zaehleNtfy(); } catch (e) { /* auf der Login-Seite gibt es keinen Zähler */ }
    // Ohne Content-Type-Header: einfache Anfrage, ntfy erkennt das JSON selbst.
    // Bei „zu viele auf einmal“ (429) kurz warten und nochmal versuchen.
    const versuch = (rest) => meinFetch(CONFIG.NTFY_SERVER, { method: 'POST', body: JSON.stringify(nachricht), headers: ntfyHeaders() })
      .then((r) => {
        // Token abgelehnt: ab jetzt ohne Token und diese Meldung gleich nochmal ohne Token schicken
        if ((r.status === 401 || r.status === 403) && ntfyToken()) { tokenAbgelehnt(); return versuch(rest); }
        if (r.status === 429) { try { ntfyStandHolen(); } catch (e) { /* egal */ } }
        if (r.status === 429 && rest > 0) return new Promise((ok) => setTimeout(ok, 8000)).then(() => versuch(rest - 1));
        return r.ok;
      })
      .catch((e) => { console.warn('[Fracht-Wächter] Push fehlgeschlagen', e); return false; });
    return versuch(3);
  }

  // Meldungen über Google (Firebase) dürfen nur ca. 4 KB groß sein, sonst schneidet ntfy den Text ab (die App zeigt dann
  // nur „🕐 Lade…“). Ist die Meldung zu groß, fallen zuerst Nebenzeilen weg, nie Preis, Zeiten, Kontakt oder E-Mail.
  function fcmGroesse(x) {
    const b = (t) => { try { return new TextEncoder().encode(String(t || '')).length; } catch (e) { return String(t || '').length * 2; } };
    return 2 * (b(x.title) + b(x.message) * 1.05 + b(JSON.stringify(x.actions || [])) * 1.12 + b(x.click) + 320 + b(x.topic) + b(x.sequence_id)) + 150;
  }
  function passendMachen(x) {
    // zu groß? zuerst den E-Mail-Knopf der ntfy-Meldung weglassen (die Fracht-App baut die E-Mail selbst aus der ✉-Zeile),
    // dann erst die Beschreibung aus dem App-Link (Ware, Bemerkung – dort steht z. B. Gefahrgut), dann Nebenzeilen
    if (fcmGroesse(x) > 3900 && Array.isArray(x.actions) && x.actions.some((a) => /^mailto:/.test(a.url || ''))) x.actions = x.actions.filter((a) => !/^mailto:/.test(a.url || ''));
    if (fcmGroesse(x) > 3900 && x.click && x.click.indexOf('!i=') !== -1) x.click = x.click.split('!i=')[0];
    const reihenfolge = [/^ℹ/, /^\*\*Ware/, /^ {3}/, /^➡️/, /^🏠/, /^✅/, /^⚠️/, /^↩/]; // ↩ Rückweg bleibt am längsten drin
    for (let runde = 0; runde < 30 && x.message && fcmGroesse(x) > 3900; runde++) {
      const z = x.message.split('\n');
      let weg = -1;
      for (const re of reihenfolge) { weg = z.findIndex((l) => re.test(l)); if (weg !== -1) break; }
      if (weg === -1) break;
      z.splice(weg, 1);
      x.message = z.join('\n');
    }
    if (x.message && fcmGroesse(x) > 3900 && Array.isArray(x.actions)) {
      x.actions = x.actions.filter((a) => !/^mailto:/.test(a.url || '')); // notfalls ohne E-Mail-Knopf, aber vollständiger Text
    }
  }

  // ---------- RIO Live Monitor: LKW-Positionen an den Timocom-Tab weitergeben ----------
  // Der RIO-Tab muss über den Knopf „RIO öffnen“ im Timocom-Kasten geöffnet werden.
  // Die Positionen gehen direkt von Tab zu Tab, nicht über fremde Server.
  if (location.hostname === 'livemonitor.rio.cloud') {
    const namen = {};
    let letzte = null;
    let verbunden = false;
    window.fetch = function (input, init) {
      const url = String(typeof input === 'string' ? input : (input && input.url) || '');
      const p = origFetch.apply(this, arguments);
      const istNamen = /\/states\/assets(\?|$)/.test(url);
      const istLive = /\/live-state\/assets/.test(url);
      if (istNamen || istLive) {
        p.then((r) => r.clone().json()).then((j) => {
          const items = (j && j.items) || [];
          if (istNamen) {
            items.forEach((a) => { namen[a.id] = { name: String(a.name || '').trim(), kennzeichen: a.license_plate || '' }; });
          } else {
            letzte = items;
          }
          rioSenden();
        }).catch(() => { /* egal */ });
      }
      return p;
    };
    const rioDaten = () => (letzte || [])
      .filter((x) => x.position && x.position.value && typeof x.position.value.latitude === 'number')
      .map((x) => ({
        id: x.asset_id,
        name: (namen[x.asset_id] || {}).name || '',
        kennzeichen: (namen[x.asset_id] || {}).kennzeichen || '',
        lat: x.position.value.latitude,
        lon: x.position.value.longitude,
        zeit: Date.parse(x.position.occurred_at) || null,
        adresse: (x.address && x.address.value) || '',
        kmh: x.speed && typeof x.speed.value === 'number' ? x.speed.value : null,
      }));
    function rioSenden() {
      const lkw = rioDaten();
      verbunden = false;
      if (lkw.length && window.opener && !window.opener.closed) {
        try { window.opener.postMessage({ typ: 'mzw-rio', lkw: lkw, t: Date.now() }, 'https://my.timocom.com'); verbunden = true; } catch (e) { /* egal */ }
      }
      rioHinweis(lkw.length);
    }
    let hinweis = null;
    function rioHinweis(anzahl) {
      if (!document.body) return;
      if (!hinweis) {
        hinweis = document.createElement('div');
        hinweis.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#fff;color:#222;' +
          'border:2px solid #c8102e;border-radius:8px;padding:6px 10px;font:12px/1.4 Arial,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25);';
      }
      if (!hinweis.isConnected) document.body.appendChild(hinweis);
      hinweis.textContent = verbunden
        ? '🔔 Fracht-Wächter: ' + anzahl + ' LKW-Positionen gehen an Timocom ✔'
        : '🔔 Fracht-Wächter: nicht mit Timocom verbunden – bitte RIO über den Knopf „RIO öffnen“ im Timocom-Kasten öffnen.';
    }
    setInterval(rioSenden, 30 * 1000);
    document.addEventListener('DOMContentLoaded', () => rioHinweis(0));
    return;
  }

  // ---------- Login-Seite: warnen, wenn sie länger offen bleibt ----------
  if (location.hostname === 'iam.timocom.com') {
    setTimeout(() => {
      if (location.hostname === 'iam.timocom.com') {
        sende('Timocom: abgemeldet',
          'Die Timocom-Login-Seite ist seit ' + CONFIG.LOGIN_WARNUNG_MINUTEN +
          ' Minuten offen. Solange du nicht wieder eingeloggt bist, kommen keine Frachtmeldungen.', 4, 'warning');
        pcMelden({ abgemeldet: true, liste: 0, suche: false });
        setInterval(() => { if (location.hostname === 'iam.timocom.com') pcMelden({ abgemeldet: true, liste: 0, suche: false }); }, 10 * MIN);
      }
    }, CONFIG.LOGIN_WARNUNG_MINUTEN * MIN);
    return;
  }

  // ------------------------------ Speicher ------------------------------
  const LS = 'mzw_';
  const lade = (k, d) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const speichere = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* egal */ } };

  const gespeicherteEinst = lade('einst', {});
  const einstStand = lade('einstStand', 0);
  // Einmalig zu v2.5: gespeicherte ☀️-Grenzen auf die neuen, weiteren Werte anheben
  if (einstStand < 25) {
    ['heuteMaxLeerKm', 'heuteMaxLastKm'].forEach((k) => {
      if (typeof gespeicherteEinst[k] === 'number' && gespeicherteEinst[k] < STANDARD[k]) gespeicherteEinst[k] = STANDARD[k];
    });
  }
  // Einmalig zu v2.8: Umstieg auf Android – Löschen weggefallener Angebote an, MZ-Logo eintragen
  if (einstStand < 28) {
    if (!String(gespeicherteEinst.logoUrl || '').trim()) delete gespeicherteEinst.logoUrl;
    gespeicherteEinst.veralteteLoeschen = true;
  }
  // Einmalig zu v2.9: kein Logo neben den Angeboten, 🟠 (unter 100 %) nicht mehr melden
  if (einstStand < 29) {
    if (gespeicherteEinst.logoUrl === 'https://mz-transport.de/wp-content/uploads/go-x/u/2e72876b-348b-4bfd-8521-53e8c33c5d62/w192,h192,rtfit,bg,el1,ex1,fpng/image.png?v=1787154983183') delete gespeicherteEinst.logoUrl;
    ['minDeckung', 'zusatzMinDeckung'].forEach((k) => {
      if (typeof gespeicherteEinst[k] === 'number' && gespeicherteEinst[k] < 100) gespeicherteEinst[k] = 100;
    });
  }
  // Einmalig zu v3.2: jede Ladung muss den vollen Fahrer-Tagessatz tragen – auch ☀️/🌙/🔁
  if (einstStand < 32 && 'zusatzOhneTagessatz' in gespeicherteEinst) gespeicherteEinst.zusatzOhneTagessatz = false;
  // Einmalig zu v3.4: 🌙 Nacht auch für Touren, die vor 15 Uhr geladen und abends/nachts entladen werden
  if (einstStand < 33 && gespeicherteEinst.nachtLadenAb === 15) delete gespeicherteEinst.nachtLadenAb;
  // Einmalig zu v3.9: ☀️ Heute leer bis Mitternacht (statt 20 Uhr)
  if (einstStand < 34 && gespeicherteEinst.heuteFertigBis === 20) delete gespeicherteEinst.heuteFertigBis;
  // Einmalig zu v5.0: keine Text-Signatur mehr – die echte Signatur (mit Logo) kommt aus der Mail-App
  if (einstStand < 35 && /^Mit freundlichen Grüßen\n\n\S/.test(String(gespeicherteEinst.mailSignatur || ''))) delete gespeicherteEinst.mailSignatur;
  // Einmalig zu v5.4: Angebote mit A-Schild (Abfalltransport) nie melden
  if (einstStand < 36 && typeof gespeicherteEinst.ausschlussWoerter === 'string' && !/a-schild/i.test(gespeicherteEinst.ausschlussWoerter)) {
    gespeicherteEinst.ausschlussWoerter = gespeicherteEinst.ausschlussWoerter.replace(/[\s,]+$/, '') + ', A-Schild, A Schild, A-Tafel';
  }
  // Einmalig zu v5.7: 250 eigene Abfragen pro Stunde
  if (einstStand < 37 && typeof gespeicherteEinst.maxAbfragenProStunde === 'number' && gespeicherteEinst.maxAbfragenProStunde < 250) gespeicherteEinst.maxAbfragenProStunde = 250;
  // Einmalig zu v5.9: Arbeitszeit wieder rund um die Uhr
  if (einstStand < 38 && gespeicherteEinst.aktivVon === 8 && gespeicherteEinst.aktivBis === 18) { delete gespeicherteEinst.aktivVon; delete gespeicherteEinst.aktivBis; }
  // Einmalig zu v7.1: Token vom ntfy-Abo (Supporter) eintragen, falls noch keiner drinsteht
  if (einstStand < 39 && !String(gespeicherteEinst.ntfyToken || '').trim()) delete gespeicherteEinst.ntfyToken;
  if (einstStand < 39) {
    if (Object.keys(gespeicherteEinst).length) speichere('einst', gespeicherteEinst);
    speichere('einstStand', 39);
  }
  // v7.5: alter Token (war nur eine Browser-Sitzung und ist abgelaufen) -> dauerhafter Token „Fracht-Wächter“
  if (einstStand < 40) {
    if (!String(gespeicherteEinst.ntfyToken || '').trim()) {
      delete gespeicherteEinst.ntfyToken;
      if (Object.keys(gespeicherteEinst).length) speichere('einst', gespeicherteEinst);
    }
    speichere('einstStand', 40);
  }
  let einst = Object.assign({}, STANDARD, gespeicherteEinst);

  const state = {
    gesehen: lade('gesehen', {}),     // Angebots-ID -> zuletzt gesehen
    inhalte: lade('inhalte', {}),     // Inhalt ohne Preis -> { preis, t }
    suchen: lade('suchen', {}),       // Such-Schlüssel -> letzte Antwort
    laender: Object.assign({ 671: 'DE' }, lade('laender', {})),
    waehrungen: Object.assign({ 3: 'EUR' }, lade('waehrungen', {})),
    rueckCache: {},
    letzteZeilen: new Map(),
    letzteAntwort: 0,
    angebote: 0,
    gemeldet: 0,
    gewarnt: false,
    status: 'Warte auf die erste Aktualisierung …',
    standort: '',
    protokoll: [],                    // letzte Entscheidungen für die Anzeige
    gruende: lade('gruende', {}),     // Angebots-ID -> { t, x } – warum gemeldet / nicht gemeldet (24 Std.)
    rio: lade('rio', null),           // { lkw: [...], t } – letzte Positionen aus RIO
    bestes: lade('bestes', {}),       // „Tag|Kanal“ -> beste Deckung bisher (für 🏆)
    zaehler: { heute: 0, rund: 0, nacht: 0, fern: 0, sonst: 0 },
    tabelle: new Map(),               // Angebots-ID -> { farbe, info } für die eingefärbte Liste
    letzteAnfrage: null,              // letzte Suchanfrage (für „Beste je Reiter senden“)
    letztePos: null,
    topLaeuft: false,
    abfragen: lade('abfragen', []),   // Zeitpunkte der eigenen Abfragen (für das Stundenlimit)
    aktiv: lade('aktiv', {}),         // gemeldete Angebote: ID -> { k: [{topic, sid}], such, fehlt, bis, t, text }
    anzahl: {},                       // Such-Schlüssel -> Anzahl Angebote der letzten Liste
    listenInfo: {},                   // Such-Schlüssel -> { n, tag, sort } – fürs Lebenszeichen (welche Liste ist voll?)
    entfernt: 0,
  };
  // Arbeitszeit des Wächters (z. B. 8–18 Uhr). Außerhalb: keine Meldungen, keine eigenen Abfragen, keine Warnungen.
  function imDienst(t) {
    const von = Number(einst.aktivVon), bis = Number(einst.aktivBis);
    if (!isFinite(von) || !isFinite(bis) || von === bis) return true;
    const d = new Date(t || Date.now()), h = d.getHours() + d.getMinutes() / 60;
    return von < bis ? h >= von && h < bis : (h >= von || h < bis);
  }
  // Folgetour-Modus: heute wurde schon eine Tour gefahren → heute geladene Touren tragen nur einen Teil des Tagessatzes
  const folgetourAktiv = () => lade('folgetourTag', '') === new Date().toDateString();
  const maxAbfragen = () => Math.max(1, Number(einst.maxAbfragenProStunde) || CONFIG.MAX_ABFRAGEN_PRO_STUNDE);
  const abfragenLetzteStunde = () => {
    const grenze = Date.now() - STD;
    state.abfragen = state.abfragen.filter((t) => t > grenze);
    return state.abfragen.length;
  };
  // Kontakte gehen vor: Rückladungs-Checks, Team-Suche nach E-Mails und Gelöscht-Prüfungen nur, solange genug Abfragen frei sind
  const nurKontakteFrei = () => abfragenLetzteStunde() >= maxAbfragen() - CONFIG.RESERVE_FUER_KONTAKTE;

  // LKW-Positionen aus dem RIO-Tab empfangen
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://livemonitor.rio.cloud' || !e.data || e.data.typ !== 'mzw-rio') return;
    if (!Array.isArray(e.data.lkw)) return;
    state.rio = { lkw: e.data.lkw, t: Date.now() };
    speichere('rio', state.rio);
    zeichne();
  });
  const rioAktuell = () => state.rio && Date.now() - state.rio.t < 10 * MIN;
  if (CONFIG.TESTMODUS) window.__mzwState = state;

  // ------------------- Timocom-Anfragen mitlesen ---------------------
  const API_SUCHE = '/api/freight-search-offers';
  let authToken = null;

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__mzwUrl = String(url);
    this.__mzwMethod = String(method).toUpperCase();
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (/^authorization$/i.test(k) && /^Bearer /.test(String(v))) authToken = String(v);
    return origSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__mzwMethod === 'POST' && this.__mzwUrl && this.__mzwUrl.indexOf(API_SUCHE) !== -1) {
      const anfrage = body;
      this.addEventListener('loadend', () => {
        let antwort;
        try {
          antwort = (this.responseType === '' || this.responseType === 'text') ? this.responseText : this.response;
        } catch (e) { return; }
        try { listeDa(this.status, anfrage, antwort); } catch (e) { console.warn('[Fracht-Wächter]', e); }
      });
    } else if (this.__mzwUrl && (!/^https?:\/\//.test(this.__mzwUrl) || this.__mzwUrl.indexOf(location.host) !== -1)) {
      this.addEventListener('loadend', () => {
        let antwort = null;
        try { antwort = (this.responseType === '' || this.responseType === 'text') ? this.responseText : (this.responseType === 'json' ? this.response : null); } catch (e) { return; }
        try { mailBeobachte(this.__mzwMethod, this.__mzwUrl, this.status, antwort); } catch (e) { /* egal */ }
      });
    }
    return origSend.apply(this, arguments);
  };

  if (origFetch) {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      try {
        const h = new Headers((init && init.headers) || (input && input.headers) || {});
        const a = h.get('Authorization');
        if (a && /^Bearer /.test(a)) authToken = a;
      } catch (e) { /* egal */ }
      const p = origFetch.apply(this, arguments);
      const methode = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (methode === 'POST' && String(url).indexOf(API_SUCHE) !== -1) {
        const body = init && init.body;
        p.then((r) => r.clone().text().then((t) => listeDa(r.status, body, t)))
          .catch((e) => console.warn('[Fracht-Wächter]', e));
      } else if (!/^https?:\/\//.test(String(url)) || String(url).indexOf(location.host) !== -1) {
        p.then((r) => r.clone().text().then((t) => mailBeobachte(methode, String(url), r.status, t))).catch(() => { /* egal */ });
      }
      return p;
    };
  }

  // Eigene Abfragen bei Timocom – nacheinander, mit Pause, mit deiner Anmeldung
  let kette = Promise.resolve();
  function api(methode, pfad, body, voll, alsText) {
    const lauf = kette.then(() => warte(CONFIG.PAUSE_ZWISCHEN_ABFRAGEN_MS)).then(() => {
      if (!authToken) throw new Error('Noch keine Anmeldung mitgelesen');
      if (!imDienst()) throw new Error('außerhalb der Arbeitszeit');
      if (abfragenLetzteStunde() >= maxAbfragen()) throw new Error('Stundenlimit erreicht');
      state.abfragen.push(Date.now());
      speichere('abfragen', state.abfragen);
      const headers = alsText ? { 'Accept': 'text/html,application/xhtml+xml' }
        : { 'Accept': 'application/json;qs=0.9', 'Authorization': authToken, 'X-Requested-With': 'XMLHttpRequest' };
      if (body) headers['Content-Type'] = 'application/json';
      return meinFetch(voll || pfad.indexOf('/app/') === 0 ? pfad : '/app/tccargo' + pfad, {
        method: methode, credentials: 'include', headers: headers, body: body ? JSON.stringify(body) : undefined,
      });
    }).then((r) => {
      if (r.status === 401 || r.status === 403) throw new Error('Nicht angemeldet (' + r.status + ')');
      if (!r.ok) throw new Error('Timocom antwortet ' + r.status);
      return alsText ? r.text() : r.json();
    });
    kette = lauf.catch(() => { /* weiter mit der nächsten */ });
    return lauf;
  }
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));

  // Alle Angebote einer Liste bewerten – für die Farben in der Timocom-Tabelle. Mehrere Listen (Tabs) landen in derselben
  // Tabelle; was 15 Min. in keiner Liste mehr stand, fliegt raus.
  function tabelleBewerten(zeilen, pos) {
    const jetzt = Date.now(), startT = Math.max(jetzt, freiAbMs());
    for (const [id, e] of state.tabelle) if (jetzt - (e.t || 0) > 15 * MIN) state.tabelle.delete(id);
    for (const o of zeilen) {
      if (!o || !o.publicOfferId) continue;
      try {
        const ag = ausschluss(o);
        if (ag) { state.tabelle.set(o.publicOfferId, { farbe: 'aus', info: 'Fracht-Wächter: ausgeblendet – ' + ag, t: jetzt }); continue; }
        const b = bewerte(o, pos, startT);
        const mk = merkmale(o);
        // ohne Preis: 🔵 nur, wenn es eine Ladung ist, die wir auch melden würden (sonst keine Farbe)
        const farbe = b.machbar && b.deckung === null && !ohnePreisErlaubt(o, b) ? null : farbeVon(b);
        state.tabelle.set(o.publicOfferId, { farbe: farbe, deckung: b.machbar ? b.deckung : null, info: kurzInfo(b) + (mk.length ? ' · ✅ ' + mk.join(', ') : ''), t: jetzt,
          s: strecke(o), p: o.price ? o.price.amount : null, lt: (((o.loadingplaces || [])[0] || {}).earliestLoadingDate || '').slice(5, 10) });
      } catch (e) { /* egal */ }
    }
    setTimeout(faerbeTabelle, 300);
  }

  // ---------- 🧠👁 Mehrere Timocom-Tabs (z. B. einer „heute“, einer „morgen“): EIN Tab prüft alles („Gehirn“),
  // die anderen färben nur ihre eigene Tabelle und reichen ihre Suchliste an ihn weiter („Auge“).
  // So wird jede Tour nur einmal geprüft und gemeldet, und Löschen passt für jede Liste.
  const kanalTabs = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mzw-listen') : null;
  const LEASE = 90 * 1000;
  let binLeiter = true;
  function leiterFrisch() { const l = lade('leiter', null); return !!l && Date.now() - l.t < LEASE ? l : null; }
  function leiterPruefen() {
    if (!kanalTabs) { binLeiter = true; return; }
    const l = leiterFrisch();
    // nur ein Tab mit offener Frachtsuche darf prüfen; wer woanders hinwechselt, gibt ab
    if (aufSuchseite() && (!l || l.tab === TAB_ID)) speichere('leiter', { tab: TAB_ID, t: Date.now() });
    else if (!aufSuchseite() && l && l.tab === TAB_ID) speichere('leiter', { tab: '', t: 0 }); // weg von der Suche: abgeben
    const l2 = leiterFrisch();
    const vorher = binLeiter;
    binLeiter = !l2 || l2.tab === TAB_ID;
    if (vorher !== binLeiter) { try { zeichne(); } catch (e) { /* egal */ } }
  }
  function listeDa(status, anfrage, antwort) {
    leiterPruefen();
    if (binLeiter || !kanalTabs) return verarbeite(status, anfrage, antwort);
    // 👁 Auge: eigene Tabelle färben, Liste weitergeben
    state.letzteAntwort = Date.now();
    try {
      const daten = typeof antwort === 'string' ? JSON.parse(antwort) : antwort;
      const zeilen = (daten && daten.invocationResult && daten.invocationResult.filteredOfferRows) || [];
      const anfrageObj = typeof anfrage === 'string' ? JSON.parse(anfrage) : (anfrage || {});
      if (status === 200 && Array.isArray(zeilen)) { state.angebote = zeilen.length; tabelleBewerten(zeilen, lkwPosition(anfrageObj.searchFilter || {})); }
    } catch (e) { /* egal */ }
    kanalTabs.postMessage({ typ: 'liste', tab: TAB_ID, auth: authToken || '', status: status,
      anfrage: typeof anfrage === 'string' ? anfrage : JSON.stringify(anfrage || {}), antwort: typeof antwort === 'string' ? antwort : JSON.stringify(antwort) });
    setzeStatus('👁 ' + (state.angebote || 0) + ' Angebote an den prüfenden Timocom-Tab weitergegeben');
  }
  if (kanalTabs) {
    kanalTabs.onmessage = (ev) => {
      const d = ev.data;
      if (!d || d.typ !== 'liste' || d.tab === TAB_ID) return;
      leiterPruefen();
      if (!binLeiter) return;
      if (!authToken && d.auth) authToken = d.auth;
      try { verarbeite(d.status, d.anfrage, d.antwort); } catch (e) { console.warn('[Fracht-Wächter]', e); }
    };
  }
  setInterval(leiterPruefen, 20 * 1000);
  setTimeout(leiterPruefen, 1500);
  // Tab wird neu geladen oder geschlossen: sofort abgeben, damit der andere Tab nicht erst 90 Sek. warten muss
  function leiterAbgeben() { try { const l = lade('leiter', null); if (l && l.tab === TAB_ID) speichere('leiter', { tab: '', t: 0 }); } catch (e) { /* egal */ } }
  window.addEventListener('pagehide', leiterAbgeben);
  window.addEventListener('beforeunload', leiterAbgeben);
  // Wie viele Angebote stehen in allen aktiven Suchlisten zusammen?
  function aktiveListen() {
    const jetzt = Date.now();
    return Object.keys(state.suchen).filter((k) => !/^rueck:/.test(k) && jetzt - state.suchen[k] < 3 * MIN);
  }

  // ↺ schon einmal als „wieder da“ neu gemeldet (nur einmal je Tour)
  const wiederDa = lade('wiederDa', {});
  // ✏️ Fassung je Angebot (Inhalt + Preis): ändert die Firma ein bestehendes Angebot (Preis, Datum, Uhrzeit, Gewicht …),
  // bleibt die Nummer gleich – dann wird es neu geprüft, statt als „schon gesehen“ zu verschwinden
  const fassung = lade('fassung', {});
  // 🩺 Abgleich: Ausschlüsse aus älteren Filtern (ADR-, Wort- und Gewichtsprüfung, schlechte Rückladung) gelten ab 11.9 nicht mehr ungeprüft
  if (lade('filterV', '') !== '11.9') { speichere('filterV', '11.9'); speichere('filterStand', Date.now()); }
  const filterStand = lade('filterStand', 0);
  // 12.2: Tagestouren mit Leerfahrt heim werden jetzt inkl. Leerfahrt eingefärbt – schon gemeldete einmal still neu bewerten
  if (!lade('farbStand122', 0)) speichere('farbStand122', Date.now());
  const farbStand = lade('farbStand122', 0);
  let abgleichT = 0;
  // ♻️ Doppel einer gemeldeten Tour, deren gemeldete Fassung weggefallen ist: beim nächsten Auftauchen neu prüfen
  const nochmal = lade('nochmal', {});
  // 11.5: Bis 11.4 wurde ein Zeitstempel vom 26.–31. als „26 t“ gelesen – diese Touren einmal neu prüfen (normal, mit Ton)
  const nachpruefen = lade('nachpruefen', {});
  if (!lade('datumFix115', false)) {
    Object.keys(state.gruende).forEach((k) => { const g = state.gruende[k]; if (g && /^✗ (2[6-9]|3[01])(,\d+)? t laut Beschreibung/.test(g.x)) { nachpruefen[k] = Date.now(); delete state.gruende[k]; } });
    speichere('nachpruefen', nachpruefen); speichere('gruende', state.gruende); speichere('datumFix115', true);
  }
  Object.keys(nachpruefen).forEach((k) => { if (Date.now() - nachpruefen[k] > 24 * STD) delete nachpruefen[k]; });
  Object.keys(nochmal).forEach((k) => { if (Date.now() - nochmal[k] > 24 * STD) delete nochmal[k]; });
  Object.keys(wiederDa).forEach((k) => { if (Date.now() - wiederDa[k] > 3 * 24 * STD) delete wiederDa[k]; });

  // ------------------------------ Auswertung ------------------------------
  function verarbeite(status, anfrage, antwort) {
    if (status === 401 || status === 403) state.abgemeldetT = Date.now();
    else if (status === 200) state.abgemeldetT = 0;
    if ((status === 401 || status === 403) && imDienst()) {
      warne('Timocom: abgemeldet',
        'Die Frachtsuche meldet „nicht angemeldet“. Bitte am PC neu einloggen, sonst kommen keine Meldungen mehr.');
      setzeStatus('Abgemeldet – bitte neu einloggen');
      return;
    }
    if (status !== 200) return;

    const daten = typeof antwort === 'string' ? JSON.parse(antwort) : antwort;
    const zeilen = daten && daten.invocationResult && daten.invocationResult.filteredOfferRows;
    if (!Array.isArray(zeilen)) return;

    let anfrageObj = {};
    try { anfrageObj = typeof anfrage === 'string' ? JSON.parse(anfrage) : {}; } catch (e) { /* egal */ }
    const filter = anfrageObj.searchFilter || {};
    const schluessel = suchSchluessel(filter);

    const jetzt = Date.now();
    const vorher = state.suchen[schluessel];
    const neustart = !vorher || jetzt - vorher > CONFIG.NEUSTART_NACH_MINUTEN * MIN;
    // kurze Unterbrechung (abgemeldet, PC kurz aus): was in der Zeit neu dazukam, wird trotzdem geprüft
    const nachholen = neustart && !!vorher && jetzt - vorher <= CONFIG.NACHHOLEN_BIS_MINUTEN * MIN;
    state.suchen[schluessel] = jetzt;
    state.letzteAntwort = jetzt;
    speichere('listeT', jetzt); // für andere Timocom-Tabs: hier läuft die Suche
    state.angebote = zeilen.length;
    state.letzteZeilen = new Map(zeilen.filter((o) => o && o.publicOfferId).map((o) => [o.publicOfferId, o]));
    try { pruefeVeraltet(schluessel, zeilen, filter); } catch (e) { console.warn('[Fracht-Wächter]', e); }

    const pos = lkwPosition(filter);
    state.standort = pos ? pos.text : 'unbekannt (Suche ohne Umkreis-Startort)';
    state.letzteAnfrage = anfrageObj;
    state.letztePos = pos;

    tabelleBewerten(zeilen, pos);
    if (!/^rueck:/.test(schluessel)) probeListen.set(schluessel, { t: jetzt, filter: filter, zeilen: zeilen });

    if (state.gewarnt) {
      state.gewarnt = false;
      sende('Fracht-Wächter läuft wieder', 'Timocom liefert wieder aktuelle Suchergebnisse.', 3, 'white_check_mark');
    }

    const neue = [];
    for (const o of zeilen) {
      if (!o || !o.publicOfferId || o.deleted) continue;
      const id = o.publicOfferId;
      const istNeu = !state.gesehen[id];
      state.gesehen[id] = jetzt;

      const fp = inhaltOhnePreis(o);
      const alt = state.inhalte[fp];
      const preis = o.price ? o.price.amount : null;
      // „gemeldet“ bleibt nur, solange der Preis gleich bleibt
      state.inhalte[fp] = { preis: preis, t: jetzt, gemeldet: !!(alt && alt.gemeldet && alt.preis === preis), id: (alt && alt.id) || id };
      const neueFassung = fp + '|' + (preis === null ? '' : preis), alteFassung = fassung[id];
      fassung[id] = neueFassung;
      if (!istNeu && alteFassung && alteFassung !== neueFassung && !(neustart && !nachholen)) {
        const altPreisText = alteFassung.split('|').pop(), altPreis = altPreisText === '' ? null : Number(altPreisText);
        // Die alte Meldung bleibt, bis die neue Fassung geprüft ist: passt sie noch, wird die Meldung ersetzt (gleiche Nummer),
        // passt sie nicht mehr (z. B. Preis gesenkt), wird sie gelöscht – siehe notiere()
        if (state.inhalte[fp]) state.inhalte[fp].gemeldet = false;
        const pg = altPreis !== preis;
        neue.push({ o: o, preisGeaendert: pg, alterPreis: pg ? altPreis : null, geaendert: true });
        continue;
      }

      // ↺ Schon gemeldet, dann aus der App gelöscht (z. B. weil sie in einer anderen Liste fehlte) – steht aber wieder in einer
      // Suchliste: einmal neu prüfen und melden, damit sie nicht verloren geht
      if (!istNeu && nachpruefen[id] && !state.aktiv[id]) {
        delete nachpruefen[id]; speichere('nachpruefen', nachpruefen);
        if (state.inhalte[fp]) state.inhalte[fp].gemeldet = false;
        neue.push({ o: o, preisGeaendert: false, alterPreis: null, nachgeholt: true });
        continue;
      }
      if (!istNeu && nochmal[id] && !state.aktiv[id]) {
        delete nochmal[id]; speichere('nochmal', nochmal);
        neue.push({ o: o, preisGeaendert: false, alterPreis: null, neuEingestellt: true });
        continue;
      }
      if (!istNeu && !state.aktiv[id] && !wiederDa[id]) {
        const g = state.gruende[id];
        if (g && /^✓ gemeldet/.test(g.x)) {
          wiederDa[id] = jetzt; speichere('wiederDa', wiederDa);
          if (state.inhalte[fp]) state.inhalte[fp].gemeldet = false;
          neue.push({ o: o, preisGeaendert: false, alterPreis: null, wiederDa: true });
          continue;
        }
      }
      if (!istNeu) continue;
      if (neustart && !nachholen) {
        grundMerken(id, '– still übernommen: stand schon in der Liste, als die Suche ' + (vorher ? 'nach längerer Pause wieder' : 'neu') + ' gestartet wurde');
        continue;
      }
      if (alt && alt.preis !== null && preis === null) { grundMerken(id, '– Preis nur zurückgezogen, Fracht war schon da'); continue; }
      const preisGeaendert = !!alt && alt.preis !== preis;
      // gleiche Fracht nur neu eingestellt: nur überspringen, wenn sie schon gemeldet wurde – sonst normal prüfen
      // gleiche Fracht unter neuer Nummer neu eingestellt: still neu melden (die alte Meldung wird ersetzt) – sonst verschwände
      // die Tour aus der App, sobald die alte Nummer bei Timocom wegfällt
      if (alt && !preisGeaendert && alt.gemeldet) { neue.push({ o: o, preisGeaendert: false, alterPreis: null, neuEingestellt: true }); continue; }
      neue.push({ o: o, preisGeaendert: preisGeaendert, alterPreis: preisGeaendert ? alt.preis : null });
    }

    // Lohnt sich laut Tabelle (🥇/🟢/🟡 oder knapp drunter), aber nie gemeldet und nie genau geprüft – z. B. still übernommen,
    // weil der PC über Nacht aus war und die Tour in der Zeit reinkam: jetzt genau prüfen und ggf. melden
    if (imDienst()) {
      const knappGrenze = Number(einst.knappAb) > 0 ? Number(einst.knappAb) - 3 : Infinity; // Luftlinie → LKW-Route kann ein paar % kippen
      for (const o of zeilen) {
        if (!o || !o.publicOfferId || o.deleted) continue;
        const id = o.publicOfferId, e = state.tabelle.get(id), g = state.gruende[id];
        if (!e) continue;
        const lohnt = e.farbe === 'gruen' || e.farbe === 'gold' || e.farbe === 'gelb' || e.farbe === 'anfrage' || (e.farbe === 'orange' && e.deckung != null && e.deckung >= knappGrenze);
        if (!lohnt) continue;
        if (state.aktiv[id] || neue.some((n) => n.o.publicOfferId === id)) continue;
        const inh = state.inhalte[inhaltOhnePreis(o)];
        if (inh && inh.gemeldet) continue;
        if (g && !/^– (still übernommen|wartet)/.test(g.x)) continue; // schon geprüft (✓/✗) – nicht nochmal
        neue.push({ o: o, preisGeaendert: false, alterPreis: null, nachgeholt: true });
      }
      // 🩺 Abgleich (alle 5 Min.): Jede Tour in der Liste ist entweder in der App, hat einen gültigen Ausschlussgrund oder wartet.
      // Alles andere (nie geprüft, Grund vergessen, aus der App gelöscht obwohl noch da, alter Filter) wird jetzt geprüft –
      // so geht nichts verloren, egal woran es lag.
      if (jetzt - abgleichT > 5 * MIN) {
        abgleichT = jetzt;
        const offen = [];
        for (const o of zeilen) {
          if (!o || !o.publicOfferId || o.deleted) continue;
          const id = o.publicOfferId;
          if (state.aktiv[id] || neue.some((n) => n.o.publicOfferId === id)) continue;
          const g = state.gruende[id], x = g ? String(g.x) : '';
          let pruefen = !g;
          if (/^– (still übernommen|gleiche Fracht|Preis nur zurückgezogen|außerhalb der Arbeitszeit|Arbeitsbeginn)/.test(x)) pruefen = true;
          if (/^– wartet/.test(x) && jetzt - g.t > 30 * MIN) pruefen = true;
          if (/^✗ (Gefahrgut|„|\d+(?:,\d+)? t laut Beschreibung|Rückladung schlecht)/.test(x) && g.t < filterStand) pruefen = true;
          if (/^✓ gemeldet/.test(x) && !wiederDa[id]) pruefen = true; // gemeldet, aus der App gelöscht, aber noch in der Liste
          if (pruefen) offen.push(o);
        }
        // schon in der App, aber noch nach alter Rechnung (vor 12.2) eingefärbt: still neu bewerten und Meldung ersetzen
        const posL = lkwPosition(filter), startL = Math.max(jetzt, freiAbMs());
        for (const o of zeilen) {
          const e = o && o.publicOfferId && state.aktiv[o.publicOfferId];
          if (!e || e.neu122 || (e.t || 0) >= farbStand || neue.some((n) => n.o.publicOfferId === o.publicOfferId)) continue;
          e.neu122 = true;
          try { const b = bewerte(o, posL, startL); if (b.machbar && b.deckungOhneHeim != null) neue.push({ o: o, preisGeaendert: false, alterPreis: null, geaendert: true, still: true }); } catch (err) { /* egal */ }
        }
        speichere('aktiv', state.aktiv);
        const tab = (o) => { const e = state.tabelle.get(o.publicOfferId); return e && e.deckung != null ? e.deckung : (o.price ? 0 : -1); };
        offen.sort((a, b) => tab(b) - tab(a)).slice(0, 30).forEach((o) => {
          const inh = state.inhalte[inhaltOhnePreis(o)]; if (inh) inh.gemeldet = false;
          if (/^✓ gemeldet/.test(String((state.gruende[o.publicOfferId] || {}).x || ''))) { wiederDa[o.publicOfferId] = jetzt; speichere('wiederDa', wiederDa); }
          neue.push({ o: o, preisGeaendert: false, alterPreis: null, nachgeholt: true });
        });
      }
      // Was in der letzten Runde nicht mehr drankam (Warteschlange), kommt jetzt zuerst
      const warte = (state.nachzuegler || []).filter((x) => x.such === schluessel && jetzt - x.t < 30 * MIN && !(x.nichtVor > jetzt));
      state.nachzuegler = (state.nachzuegler || []).filter((x) => (x.such !== schluessel || x.nichtVor > jetzt) && jetzt - x.t < 30 * MIN);
      for (const x of warte.reverse()) {
        const o = state.letzteZeilen.get(x.id);
        // nicht in DIESER Liste – steht vielleicht in einer gleichen Suche mit anderer Sortierung (zweiter Tab): weiter warten
        if (!o) { state.nachzuegler.push(x); continue; }
        if (o.deleted || state.aktiv[x.id] || neue.some((n) => n.o.publicOfferId === x.id)) continue;
        neue.unshift({ o: o, preisGeaendert: x.preisGeaendert, alterPreis: x.alterPreis, neuEingestellt: !!x.neuEingestellt, geaendert: !!x.geaendert, still: !!x.still });
      }
      // Läuft noch eine Prüfung (dauert bei vielen Angeboten länger als eine Aktualisierung): alles in die Warteschlange
      haengerLoesen();
      if (state.pruefungLaeuft && neue.length) {
        neue.forEach((n) => inWarteschlange(n, schluessel));
        neue.length = 0;
      }
    }

    aufraeumen(jetzt);
    speichere('gesehen', state.gesehen);
    Object.keys(fassung).forEach((k) => { if (!state.gesehen[k]) delete fassung[k]; });
    speichere('fassung', fassung);
    speichere('inhalte', state.inhalte);
    speichere('suchen', state.suchen);
    gruendeSpeichern();

    if (!imDienst()) {
      if (!lade('pause', false)) speichere('pause', true);
      neue.forEach((n) => grundMerken(n.o.publicOfferId, '– außerhalb der Arbeitszeit, nicht geprüft'));
      setzeStatus('Pause bis ' + einst.aktivVon + ' Uhr (Arbeitszeit ' + einst.aktivVon + '–' + einst.aktivBis + ' Uhr) – keine Meldungen');
    } else if (lade('pause', false)) {
      // Arbeitsbeginn: die besten Angebote, die über Nacht reingekommen sind
      speichere('pause', false);
      neue.forEach((n) => grundMerken(n.o.publicOfferId, '– Arbeitsbeginn: nur die besten je Reiter wurden gesendet'));
      setzeStatus('Guten Morgen – die besten Angebote werden gesendet …');
      setTimeout(() => { sendeBeste(); }, 3000);
    } else if (neustart && !nachholen && !neue.length) {
      setzeStatus('Startpunkt gesetzt: ' + zeilen.length + ' vorhandene Angebote übernommen');
    } else if (!neue.length) {
      setzeStatus(state.pruefungLaeuft ? 'Prüfung läuft – ' + (state.nachzuegler || []).length + ' Angebote warten auf die nächste Runde' : 'Läuft – keine neuen Angebote');
    } else {
      setzeStatus(neue.length + ' neue Angebote' + (neustart ? ' (seit der Unterbrechung)' : '') + ' – werden geprüft …');
      pruefeUndMelde(neue, anfrageObj, pos).catch((e) => console.warn('[Fracht-Wächter]', e));
    }
    setTimeout(lerneAusTabelle, 1500);
    zeichne();
  }

  // Angebote, die in dieser Runde nicht mehr drankommen, werden in der nächsten Aktualisierung (ca. 1 Min.) geprüft und gemeldet
  function inWarteschlange(n, such) {
    state.nachzuegler = state.nachzuegler || [];
    const id = n.o.publicOfferId;
    if (!state.nachzuegler.some((x) => x.id === id)) state.nachzuegler.push({ id: id, such: such, t: Date.now(), preisGeaendert: n.preisGeaendert, alterPreis: n.alterPreis, neuEingestellt: !!n.neuEingestellt, geaendert: !!n.geaendert, still: !!n.still, nichtVor: n.nichtVor || 0 });
    grundMerken(id, '– wartet: wird bei der nächsten Aktualisierung geprüft');
  }

  let pruefungNr = 0;
  // Sicherung: hängt eine Prüfung länger als 6 Minuten, wird sie aufgegeben – sonst kämen nie wieder Meldungen
  function haengerLoesen() {
    if (!state.pruefungLaeuft || Date.now() - (state.pruefungSeit || 0) <= 6 * MIN) return;
    state.pruefungLaeuft = false; pruefungNr++;
    state.protokoll.unshift(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' ⚠️ Prüfung hing – neu gestartet');
    state.protokoll.length = Math.min(state.protokoll.length, 5);
    state.haengerT = Date.now();
  }
  async function pruefeUndMelde(neue, anfrageObj, pos, opts) {
    haengerLoesen();
    if (state.pruefungLaeuft) { neue.forEach((n) => inWarteschlange(n, (opts && opts.such) || suchSchluessel((anfrageObj && anfrageObj.searchFilter) || {}))); return; }
    const nr = ++pruefungNr;
    state.pruefungLaeuft = true; state.pruefungSeit = Date.now();
    try { return await pruefeUndMeldeEcht(neue, anfrageObj, pos, opts); } finally { if (nr === pruefungNr) { state.pruefungLaeuft = false; schlangeWeiter(); } }
  }

  // ⏩ Warteschlange gleich weiter abarbeiten – nicht erst, wenn zufällig eine Liste kommt, während gerade nichts geprüft wird.
  // Die Besten zuerst (Touren mit Preis nach Deckung, dann Preisanfragen); die Angebote kommen aus den aktuellen Listen beider Tabs.
  let schlangeT = null;
  function schlangeWeiter() {
    if (schlangeT || !binLeiter || !imDienst() || !(state.nachzuegler || []).length) return;
    schlangeT = setTimeout(() => {
      schlangeT = null;
      if (state.pruefungLaeuft || !(state.nachzuegler || []).length) return;
      const jetzt = Date.now();
      const zeilen = new Map();
      for (const [k, l] of probeListen) if (jetzt - l.t < 10 * MIN) l.zeilen.forEach((o) => { if (o && o.publicOfferId && !o.deleted && !zeilen.has(o.publicOfferId)) zeilen.set(o.publicOfferId, { o: o, such: k, filter: l.filter }); });
      // weg, was nicht mehr in einer Liste steht oder schon gemeldet ist; Rest nach Wert sortieren
      state.nachzuegler = state.nachzuegler.filter((x) => jetzt - x.t < 30 * MIN && zeilen.has(x.id) && !state.aktiv[x.id]);
      if (!state.nachzuegler.length) return;
      const wert = (x) => { const e = state.tabelle.get(x.id); return e && e.deckung != null ? e.deckung : -1; };
      state.nachzuegler.sort((a, b) => wert(b) - wert(a));
      const bereit = state.nachzuegler.find((x) => !(x.nichtVor > jetzt));
      if (!bereit) return;
      const such = zeilen.get(bereit.id).such, filter = zeilen.get(bereit.id).filter;
      const dran = state.nachzuegler.filter((x) => zeilen.get(x.id).such === such && !(x.nichtVor > jetzt)).slice(0, CONFIG.MAX_PRUEFUNGEN_AUF_EINMAL);
      if (!dran.length) return;
      const ids = new Set(dran.map((x) => x.id));
      state.nachzuegler = state.nachzuegler.filter((x) => !ids.has(x.id));
      const neue = dran.map((x) => ({ o: zeilen.get(x.id).o, preisGeaendert: x.preisGeaendert, alterPreis: x.alterPreis, neuEingestellt: !!x.neuEingestellt, geaendert: !!x.geaendert, still: !!x.still }));
      pruefeUndMelde(neue, { searchFilter: filter }, lkwPosition(filter), { such: such }).catch((e) => console.warn('[Fracht-Wächter]', e));
    }, 1500);
  }

  async function pruefeUndMeldeEcht(neue, anfrageObj, pos, opts) {
    // Vor dem Melden frisch nachsehen, ob die Fracht-App auf dem Handy gerade offen ist (sonst bis zu 1 Min. alt)
    if (einst.stummWennAppOffen !== false && Date.now() - (state.appStatusT || 0) > 15000) { try { await appStatus(); } catch (e) { /* egal */ } }
    const suchKey = (opts && opts.such) || suchSchluessel((anfrageObj && anfrageObj.searchFilter) || {});
    // 🔙 Rückweg-Suche: der LKW ist erst nach der Entladung der angenommenen Tour frei
    const start = opts && opts.start ? Math.max(Date.now(), opts.start) : Math.max(Date.now(), freiAbMs());
    const kandidaten = [];
    let uebersprungen = 0;

    // 1. Schritt: ohne Abfragen – passt die Fracht zu uns? Zeiten und Kosten
    for (const n of neue) {
      const ag = ausschluss(n.o);
      if (ag) { notiere(n, '✗ ' + ag); continue; }
      // Gleiche Ladung zweimal eingestellt (z. B. von zwei Disponenten derselben Firma): nur einmal melden
      const dop = doppeltGemeldet(n.o);
      if (dop) { notiere(n, '– doppelt eingestellt (gleiche Firma, Strecke, Ladung und Preis), schon gemeldet'); alsGemeldet(n.o); (dop.doppelt = dop.doppelt || []).push(n.o.publicOfferId); continue; }
      const b = bewerte(n.o, pos, start);
      n.b = b;
      if (!b.machbar) { notiere(n, '✗ ' + b.grund); continue; }
      n.stamm = istStamm(n.o);
      if (!n.stamm) { // Stammkunden immer melden
        if (b.deckung !== null && b.deckung < minDeckungFuer(b.kategorie)) {
          if (knappMoeglich(n)) n.knapp = true;
          else { notiere(n, '✗ Deckung ' + Math.round(b.deckung) + ' %'); continue; }
        }
        if (zuWenigProKm(b)) { notiere(n, '✗ nur ' + zahl(euroProKm(b)) + ' €/km'); continue; }
        if (b.deckung === null && !ohnePreisErlaubt(n.o, b)) {
          notiere(n, '✗ ohne Preis, nur ' + zahl(n.o.freightLengthInMeters || 0) + ' m'); continue;
        }
      }
      kandidaten.push(n);
    }
    // Angebote ohne Preis nicht einzeln melden, sondern für die Sammelmeldung merken (spart ntfy-Kontingent und Abfragen)
    if (sammelAktiv()) {
      for (let i = kandidaten.length - 1; i >= 0; i--) {
        const n = kandidaten[i];
        if (n.b.deckung === null && !n.stamm) { sammle(n); alsGemeldet(n.o); notiere(n, '→ Sammelmeldung 🔵'); kandidaten.splice(i, 1); }
      }
    }
    verteile(kandidaten);
    if (kandidaten.length > CONFIG.MAX_PRUEFUNGEN_AUF_EINMAL) {
      // nicht mehr „+N weitere“, sondern in der nächsten Runde einzeln prüfen und melden
      kandidaten.slice(CONFIG.MAX_PRUEFUNGEN_AUF_EINMAL).forEach((n) => inWarteschlange(n, suchKey));
      kandidaten.length = CONFIG.MAX_PRUEFUNGEN_AUF_EINMAL;
    }

    // 2. Schritt: Rückladung am Zielort – nur für die besten paar, der Rest wird ohne Check gemeldet
    const passend = [];
    let rueckChecks = 0;
    for (const n of kandidaten) {
      await mitLkwRoute(n, pos, start);
      if (nochPassend(n)) n.knapp = false;
      else if (!n.stamm && knappMoeglich(n)) n.knapp = true;
      else { notiere(n, '✗ mit LKW-Route nur ' + Math.round(n.b.deckung || 0) + ' %'); continue; }
      const weit = istWeit(n.b);
      if (einst.rueckCheck && !heimFahrt(n.b) && n.b.deckung !== null) { // 🔁/Tagestouren fahren ohnehin leer heim, ohne Preis wird eh verhandelt
        if (!rueckAusCache(n.o, n.b, anfrageObj) && nurKontakteFrei() && !weit) {
          n.rueck = { fehler: 'Kontakte gehen vor' };
        } else if (weit || rueckChecks < CONFIG.MAX_RUECK_CHECKS_PRO_LISTE || rueckAusCache(n.o, n.b, anfrageObj)) {
          if (!rueckAusCache(n.o, n.b, anfrageObj)) rueckChecks++;
          try { n.rueck = (await rueckladung(n.o, n.b, anfrageObj)) || { fehler: 'Zielort ohne Koordinaten' }; } catch (e) { n.rueck = { fehler: String(e.message || e) }; }
        } else {
          n.rueck = { fehler: 'schonend übersprungen' };
        }
        // weit weg und der Rückweg ließ sich gerade nicht prüfen: lieber 1–3 Minuten später melden, dafür mit Rückweg
        if (weit && n.rueck && n.rueck.fehler && n.rueck.fehler !== 'Zielort ohne Koordinaten') {
          const id = n.o.publicOfferId, v = rueckVersuche[id] = (rueckVersuche[id] || 0) + 1;
          if (v <= 3) { inWarteschlange(n, suchKey); grundMerken(id, '– wartet: Rückweg wird noch geprüft (' + v + '. Versuch)'); continue; }
        }
        n.anschluss = besteAnschluss(n);
        await anschlussMitRoute(n);
        // Tagestour mit Leerfahrt eingerechnet, aber am Ziel gibt es gute Rückladungen (z. B. unter der Woche):
        // dann wie eine normale Tour werten – Gold ist möglich. Freitags/schlechte Gegend bleibt es bei „leer heim“.
        if (n.b.einfach && n.rueck && !n.rueck.fehler && (n.rueck.bewertung !== 'schlecht' || rueckGerettet(n))) {
          const leer = n.b.deckung;
          Object.assign(n.b, n.b.einfach);
          n.b.mitRueck = false; n.b.heimEingerechnet = false; n.b.leerHeimDeckung = leer; n.b.deckungOhneHeim = null; n.b.einfach = null;
        }
        // Schlechte Rückladung: nicht mehr verstecken, sondern melden – die Farbe geht eine Stufe runter (🟢 → 🟡, still),
        // die Meldung zeigt „↩ Rückladung … schlecht“. Entscheiden tust du.
        if (n.rueck && n.rueck.bewertung === 'schlecht' && !rueckGerettet(n) && !n.stamm && (n.b.deckung === null || n.b.deckung < einst.rueckSchlechtNurAb)) n.rueckSchlecht = true;
      }
      passend.push(n);
    }

    // 3. Schritt: Kontaktdaten für jede Meldung (höchstens 5 je Aktualisierung).
    // Zeigt der Kontakt eine ausländische Firma (USt-ID, Sitz, Vorwahl der Zentrale), fliegt das Angebot raus.
    const endgueltig = [];
    let mitKontakt = 0, abrufe = 0;
    for (const n of passend) {
      // mehr als 5 auf einmal: der Rest kommt eine Runde später einzeln (mit Kontaktdaten) statt in „+N weitere“
      if (endgueltig.length >= CONFIG.MAX_MELDUNGEN_AUF_EINMAL) { inWarteschlange(n, suchKey); continue; }
      if (mitKontakt < CONFIG.MAX_MELDUNGEN_AUF_EINMAL && abrufe < CONFIG.MAX_MELDUNGEN_AUF_EINMAL + 3) {
        mitKontakt++;
        if (einst.kontaktAbrufen) {
          abrufe++;
          try {
            const j = await api('GET', API_SUCHE + '/' + encodeURIComponent(n.o.publicOfferId));
            n.d = j && j.invocationResult;
            if (n.d) { probeDetails.unshift({ id: n.o.publicOfferId, d: n.d }); probeDetails.length = Math.min(probeDetails.length, 40); }
          } catch (e) { n.kontaktFehler = String(e.message || e); }
          const ag = n.d && ausschluss(n.o, n.d);
          if (ag) { notiere(n, '✗ ' + ag); mitKontakt--; continue; }
          if (n.d && !n.stamm) n.stamm = istStamm(n.o, n.d);
          await mailDazu(n);
        }
      }
      endgueltig.push(n);
    }

    melde(endgueltig, uebersprungen, suchKey);
    endgueltig.forEach((n) => { alsGemeldet(n.o); notiere(n, '✓ gemeldet' + (n.neuEingestellt ? ' (♻️ neu eingestellt, still)' : '') + (n.rueckZu ? ' (🔙 Rückweg)' : '') + (n.knapp ? ' (🤏 knapp, still – Vorschlag ' + euro(knappVorschlag(n.b)) + ')' : '')); });
    setzeStatus(neue.length + ' neue geprüft – ' + endgueltig.length + ' gemeldet');
  }

  // Reihenfolge fürs Melden: erst das Beste jedes Reiters, dann das Zweitbeste jedes Reiters usw. –
  // so verdrängt eine starke Fernfahrt nicht das einzige ☀️-Angebot
  function verteile(liste) {
    // 🔵 ohne Preis ganz nach hinten: erst alle Touren mit Preis (die klingeln können), dann die Preisanfragen
    const ohne = liste.filter((n) => n.b.deckung === null).sort(besteZuerst);
    const mit = liste.filter((n) => n.b.deckung !== null);
    liste.length = 0; mit.forEach((n) => liste.push(n));
    verteileMitPreis(liste);
    ohne.forEach((n) => liste.push(n));
    return liste;
  }
  function verteileMitPreis(liste) {
    liste.sort(besteZuerst);
    const rang = {}, r = new Map();
    liste.forEach((n) => { const k = n.b.kategorie; rang[k] = (rang[k] || 0) + 1; r.set(n, rang[k]); });
    const pos = new Map(liste.map((n, i) => [n, i]));
    liste.sort((a, b) => (r.get(a) - r.get(b)) || (pos.get(a) - pos.get(b)));
    return liste;
  }

  // Beste zuerst: mit Preis nach Deckung, danach ohne Preis nach Lademetern
  function besteZuerst(x, y) {
    if ((x.b.deckung === null) !== (y.b.deckung === null)) return x.b.deckung === null ? 1 : -1;
    if (x.b.deckung !== null) return y.b.deckung - x.b.deckung;
    return (y.o.freightLengthInMeters || 0) - (x.o.freightLengthInMeters || 0);
  }

  // Knopf „Beste je Reiter senden“: die besten der aktuellen Liste in jeden Reiter – auch schon bekannte Angebote
  async function sendeBeste() {
    if (state.topLaeuft) return;
    if (!state.letzteAnfrage || !state.letzteZeilen.size) { setzeStatus('Noch keine Liste da – kurz warten'); return; }
    state.topLaeuft = true;
    setzeStatus('Suche die besten Angebote je Reiter …');
    try {
      const start = Math.max(Date.now(), freiAbMs());
      const gruppen = {};
      for (const o of state.letzteZeilen.values()) {
        if (!o || o.deleted) continue;
        if (ausschluss(o)) continue;
        const b = bewerte(o, state.letztePos, start);
        if (!b.machbar) continue;
        const stamm = istStamm(o);
        if (!stamm) {
          if (b.deckung !== null && b.deckung < minDeckungFuer(b.kategorie)) continue;
          if (zuWenigProKm(b)) continue;
          if (b.deckung === null && !ohnePreisErlaubt(o, b)) continue;
        }
        (gruppen[b.kategorie] = gruppen[b.kategorie] || []).push({ o: o, b: b, stamm: stamm, preisGeaendert: false, alterPreis: null });
      }
      let gesendet = 0;
      let geprueft = 0;
      const leer = [];
      for (const kat of Object.keys(KANAELE)) {
        const liste = (gruppen[kat] || []).sort(besteZuerst).slice(0, 4);
        const top = [];
        for (const n of liste) {
          if (top.length >= CONFIG.TOP_JE_REITER || geprueft >= CONFIG.TOP_MAX_PRUEFUNGEN) break;
          geprueft++;
          await mitLkwRoute(n, state.letztePos, start);
          if (!nochPassend(n)) continue;
          if (einst.rueckCheck && !heimFahrt(n.b) && n.b.deckung !== null && !nurKontakteFrei()) {
            try { n.rueck = (await rueckladung(n.o, n.b, state.letzteAnfrage)) || { fehler: 'Zielort ohne Koordinaten' }; } catch (e) { n.rueck = { fehler: String(e.message || e) }; }
            n.anschluss = besteAnschluss(n);
            await anschlussMitRoute(n);
            if (n.rueck && n.rueck.bewertung === 'schlecht' && !rueckGerettet(n) && !n.stamm &&
              (n.b.deckung === null || n.b.deckung < einst.rueckSchlechtNurAb)) continue;
          }
          if (einst.kontaktAbrufen) {
            try { const j = await api('GET', API_SUCHE + '/' + encodeURIComponent(n.o.publicOfferId)); n.d = j && j.invocationResult; } catch (e) { n.kontaktFehler = String(e.message || e); }
          }
          if (n.d && ausschluss(n.o, n.d)) continue;
          await mailDazu(n);
          top.push(n);
        }
        if (!top.length) { leer.push(KANAELE[kat].symbol + ' ' + KANAELE[kat].name); continue; }
        for (let i = 0; i < top.length; i++) {
          const n = top[i];
          const m = formatiere(n);
          const fa = FARBEN[farbeVon(n.b, rueckFuerFarbe(n))];
          const sid = sequenzId(n.o);
          await sende(m.mitFarbe ? '⭐ Top ' + (i + 1) + ' · ' + m.titel : (fa ? fa.symbol : '❔') + ' ' + artSymbol(kat) + '⭐ Top ' + (i + 1) + ' · ' + m.titel, m.text, Math.min(prioVon(n, fa), 4), einst.kompakt ? '' : 'star',
            Object.assign({ topic: kanalFuer(n.b), sequence_id: sid }, appKlick(sid, n.b, n), m.extra));
          merke(n, kanalFuer(n.b), sid, suchSchluessel(state.letzteAnfrage.searchFilter || {}));
          gesendet++;
          await warte(800);
        }
      }
      setzeStatus('Top-Liste gesendet: ' + gesendet + ' Angebote' + (leer.length ? ' · nichts Passendes in ' + leer.join(', ') : ''));
    } catch (e) {
      setzeStatus('Top-Liste fehlgeschlagen: ' + String(e.message || e));
    } finally {
      state.topLaeuft = false;
      zeichne();
    }
  }

  function notiere(n, text) {
    // geänderte Tour passt nicht mehr → die alte Meldung aus der App nehmen
    if (n && n.geaendert && /^✗/.test(text) && n.o && state.aktiv[n.o.publicOfferId]) loesche(n.o.publicOfferId, state.aktiv[n.o.publicOfferId], 'Angebot geändert – passt nicht mehr');
    state.protokoll.unshift(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) +
      ' ' + strecke(n.o) + ' ' + text);
    state.protokoll.length = Math.min(state.protokoll.length, 5);
    if (n && n.o) grundMerken(n.o.publicOfferId, text + (n.b && n.b.deckung !== null && n.b.deckung !== undefined && !/Deckung|LKW-Route/.test(text) ? ' (' + Math.round(n.b.deckung) + ' %)' : ''));
  }

  // ------------- Warum (nicht) gemeldet? – für jedes Angebot 24 Std. lang merken -------------
  var gruendePlan = null;
  function grundMerken(id, text) {
    if (!id) return;
    state.gruende[id] = { t: Date.now(), x: String(text).slice(0, 160) };
    if (!gruendePlan) gruendePlan = setTimeout(() => { gruendePlan = null; gruendeSpeichern(); zeichne(); }, 2000);
  }
  function gruendeSpeichern() {
    const grenze = Date.now() - 24 * STD;
    let ids = Object.keys(state.gruende).filter((k) => state.gruende[k].t > grenze);
    if (ids.length > 5000) ids = ids.sort((a, b) => state.gruende[b].t - state.gruende[a].t).slice(0, 5000); // ca. 6–8 Std. bei vollen Listen
    const neu = {};
    ids.forEach((k) => { neu[k] = state.gruende[k]; });
    state.gruende = neu;
    speichere('gruende', neu);
  }
  function alsGemeldet(o) {
    const e = state.inhalte[inhaltOhnePreis(o)];
    if (e) e.gemeldet = true;
    speichere('inhalte', state.inhalte);
  }
  function grundText(id) {
    const g = state.gruende[id];
    if (!g) return state.gesehen[id] ? 'gesehen, aber nicht neu (war schon vorher in der Liste)' : 'nicht in der beobachteten Suchliste gesehen';
    return new Date(g.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' ' + g.x;
  }
  // geöffnetes Angebot (…/search/view/<ID>)
  function offenesAngebot() { const m = location.pathname.match(/\/view\/([A-Za-z0-9_-]{10,})/); return m ? m[1] : null; }

  // --------------------------- LKW-Standort ---------------------------
  // GPS aus RIO: Es zählt der LKW, der dem Startort der Suche am nächsten steht.
  // Für zwei LKW also zwei Suchen anlegen, jede mit „Von“ in der Gegend des jeweiligen LKW.
  // Feste Standorte der LKW (Rheinberg, Oberhausen) – „Name: Breite, Länge; …“
  function standortListe() {
    return String(einst.standorte || '').split(';').map((t) => {
      const m = t.match(/^\s*([^:]+):\s*(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
      return m ? { name: m[1].trim(), lat: parseFloat(m[2].replace(',', '.')), lon: parseFloat(m[3].replace(',', '.')) } : null;
    }).filter((x) => x && isFinite(x.lat) && isFinite(x.lon));
  }
  // Für jedes Angebot: von dem LKW bzw. Standort aus rechnen, der der Ladestelle am nächsten ist
  function naechsterStart(pos, ort) {
    if (!pos || !pos.alle || pos.alle.length < 2 || !ort) return pos;
    let best = pos.alle[0], d = Infinity;
    for (const x of pos.alle) { const e = kmLuft(x, ort); if (e < d) { d = e; best = x; } }
    return best;
  }
  function lkwPosition(filter) {
    const g = filter && filter.fromGeoFilter;
    const suchStart = g && g.coordinate && typeof g.coordinate.latitude === 'number'
      ? { lat: g.coordinate.latitude, lon: g.coordinate.longitude } : null;
    // Ohne RIO: Steht der Startort der Suche nahe an einem eurer Standorte (≤ 50 km), ab dem jeweils nächsten Standort rechnen
    const st = standortListe();
    if (!rioAktuell() && st.length && (!suchStart || st.some((x) => kmLuft(x, suchStart) <= 50))) {
      const alle = st.map((x) => ({ lat: x.lat, lon: x.lon, name: x.name }));
      return Object.assign({ lat: alle[0].lat, lon: alle[0].lon, alle: alle }, { text: 'Standorte ' + alle.map((x) => x.name).join(' / ') + ' (je nach Ladestelle der nähere, ohne RIO)' });
    }

    if (rioAktuell() && state.rio.lkw.length) {
      let bester = null, abstand = Infinity;
      for (const l of state.rio.lkw) {
        const d = suchStart ? kmLuft(suchStart, l) : 0;
        if (d < abstand) { abstand = d; bester = l; }
      }
      const grenze = suchStart ? (g.radius || 0) + 75 : Infinity;
      if (bester && (state.rio.lkw.length === 1 || abstand <= grenze)) {
        const name = [bester.name, bester.kennzeichen ? '(' + bester.kennzeichen + ')' : ''].filter(Boolean).join(' ') || 'LKW';
        const stand = bester.zeit ? ', Position von ' + uhrzeit(bester.zeit) : '';
        const alleRio = state.rio.lkw.filter((l) => !suchStart || kmLuft(suchStart, l) <= grenze)
          .map((l) => ({ lat: l.lat, lon: l.lon, name: l.name || l.kennzeichen || 'LKW' }));
        return {
          lat: bester.lat, lon: bester.lon, alle: alleRio.length > 1 ? alleRio : null,
          text: name + ' per RIO' + stand + (bester.adresse ? ' – ' + bester.adresse.replace(/, Deutschland$/, '') : '') +
            (alleRio.length > 1 ? ' (je nach Ladestelle der nähere LKW)' : ''),
        };
      }
    }
    if (suchStart) {
      return Object.assign(suchStart, {
        text: 'Startort der Suche: ' + [g.zipCode, g.city].filter(Boolean).join(' ') + (rioAktuell() ? ' (kein LKW in der Nähe)' : ''),
      });
    }
    return null;
  }

  function freiAbMs() {
    if (!einst.freiAb) return 0;
    const t = new Date(einst.freiAb).getTime();
    return isNaN(t) ? 0 : t;
  }

  // ------------------------- Zeit- und Kostenrechnung -------------------------
  function kmLuft(a, b) {
    const r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  const koord = (p) => p && p.address && p.address.coordinate &&
    { lat: p.address.coordinate.latitude, lon: p.address.coordinate.longitude };

  function zeitpunkt(datum, uhr, standardUhr) {
    if (!datum) return null;
    const [y, m, d] = datum.split('-').map(Number);
    const [hh, mm] = (uhr || standardUhr).split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm).getTime();
  }

  // Zählt nur Stunden zwischen 6 und 20 Uhr – Wartezeit in der Nacht kostet keinen Arbeitstag
  function arbeitsStunden(von, bis) {
    let summe = 0;
    let tag = new Date(von); tag.setHours(0, 0, 0, 0);
    while (tag.getTime() < bis) {
      const a = Math.max(von, tag.getTime() + 6 * STD);
      const e = Math.min(bis, tag.getTime() + 20 * STD);
      if (e > a) summe += (e - a) / STD;
      tag.setDate(tag.getDate() + 1);
    }
    return summe;
  }

  // Stunden zwischen 22 und 6 Uhr in einem Zeitraum – so lange stand der LKW nachts (Fahrer hat geschlafen)
  function nachtStunden(von, bis) {
    let summe = 0;
    const tag = new Date(von); tag.setHours(0, 0, 0, 0); tag.setDate(tag.getDate() - 1);
    while (tag.getTime() < bis) {
      const a = Math.max(von, tag.getTime() + 22 * STD);
      const e = Math.min(bis, tag.getTime() + 30 * STD);
      if (e > a) summe += (e - a) / STD;
      tag.setDate(tag.getDate() + 1);
    }
    return summe;
  }

  // Lade-/Entladezeiten wie bei Timocom: Datum von–bis und Uhrzeit von–bis gelten als tägliches Zeitfenster.
  // Uhrzeit über Mitternacht (z. B. 22–04 Uhr) = Fenster läuft bis zum nächsten Morgen.
  // Timocom zeigt „00:00“, wenn keine Uhrzeit angegeben ist – das ist kein Termin um Mitternacht
  const ohneUhrzeit = (p) => {
    const u1 = String((p && p.earliestLoadingTime) || '').slice(0, 5), u2 = String((p && p.latestLoadingTime) || '').slice(0, 5);
    return !!(p && p.earliestLoadingDate) && (!u1 || u1 === '00:00') && (!u2 || u2 === '00:00');
  };
  function zeitfenster(p) {
    const d1 = p.earliestLoadingDate, d2 = p.latestLoadingDate || p.earliestLoadingDate;
    if (!d1) return [{ von: -Infinity, bis: Infinity }];
    // ohne Uhrzeit: zum Rechnen normale Arbeitszeit annehmen (6–20 Uhr) statt 0 Uhr
    const leer = ohneUhrzeit(p);
    const u1 = leer ? '06:00' : (p.earliestLoadingTime || '06:00').slice(0, 5), u2 = leer ? '20:00' : (p.latestLoadingTime || '20:00').slice(0, 5);
    const ueberNacht = u2 < u1;
    const festeZeit = u2 === u1; // z. B. „08:00–08:00“ = fester Termin, 1 Std. Spielraum
    const liste = [];
    const tag = new Date(zeitpunkt(d1, '00:00')), letzter = zeitpunkt(d2, '00:00');
    for (let n = 0; n < 31 && tag.getTime() <= letzter; n++) {
      const iso = isoTag(tag);
      const von = zeitpunkt(iso, u1);
      let bis = festeZeit ? von + STD : zeitpunkt(iso, u2);
      if (ueberNacht) {
        // über Nacht: Start an jedem Tag außer dem letzten (außer es ist nur ein Tag)
        if (tag.getTime() === letzter && d1 !== d2) break;
        bis += 24 * STD;
      }
      liste.push({ von: von, bis: bis });
      tag.setDate(tag.getDate() + 1);
    }
    return liste.length ? liste : [{ von: zeitpunkt(d1, u1), bis: zeitpunkt(d2, u2) }];
  }

  function bewerte(o, pos, startMs, routen) {
    const plaetze = (o.loadingplaces || []).slice();
    const preisEur = o.price && o.price.amount && waehrung(o.price.currencyId) === 'EUR' ? o.price.amount : null;
    const erg = { machbar: true, grund: '', leerKm: 0, lastKm: (o.distanceInMeters || 0) / 1000 };
    if (!plaetze.length) return Object.assign(erg, { machbar: false, grund: 'keine Orte' });

    // Anfahrt
    const ersterOrt = koord(plaetze[0]);
    pos = naechsterStart(pos, ersterOrt);
    if (pos && pos.name) erg.abOrt = pos.name;
    // Für die Karte in der Fracht-App: LKW-Standort und alle Lade-/Entladestellen
    if (pos && typeof pos.lat === 'number') erg.abKoord = { lat: pos.lat, lon: pos.lon };
    erg.punkte = plaetze.map((p) => ({ typ: p.loadingType === 'LOADING' ? 'L' : 'E', k: koord(p), plz: String((p.address && p.address.zipCode) || '').replace(/\D/g, '').slice(0, 5) })).filter((x) => x.k);
    if (pos && ersterOrt) erg.leerKm = routen && routen.leer != null ? routen.leer : kmLuft(pos, ersterOrt) * einst.umwegFaktor;
    if (routen && routen.leer != null) erg.lkwRoute = true;

    // Last-km auf die Abschnitte verteilen (nach Luftlinie)
    const abschnitte = [];
    let summeLuft = 0;
    for (let i = 1; i < plaetze.length; i++) {
      const a = koord(plaetze[i - 1]), b = koord(plaetze[i]);
      const l = a && b ? kmLuft(a, b) : 0;
      abschnitte.push(l); summeLuft += l;
    }
    const lastKmAbschnitt = abschnitte.map((l) => summeLuft > 0 ? erg.lastKm * l / summeLuft : erg.lastKm / abschnitte.length);

    // Fahrt simulieren: 4,5 h fahren → 45 min Pause, 9 h am Tag → 11 h Ruhe, Sonn-/Feiertagsfahrverbot bis 22 Uhr
    let t = startMs, einsatz = 0, warteH = 0, lenkHeute = 0, seitPause = 0;
    // Schichten = Einsatztage des Fahrers. Eine neue Schicht beginnt nach Tagesruhe, Fahrverbot oder langem Warten
    // (z. B. heute laden, über Nacht stehen, morgen entladen = 2 Schichten = 2 Tagessätze).
    let schichten = 1, schichtStart = 0;
    const neueSchicht = () => { if (einsatz - schichtStart > 0.25) schichten++; schichtStart = einsatz; };
    const fahre = (km) => {
      let rest = km / einst.kmh;
      while (rest > 0.0001) {
        const d = new Date(t);
        if ((d.getDay() === 0 || feiertag(d)) && d.getHours() < 22) { // Sonn- und Feiertagsfahrverbot
          const ende = new Date(d); ende.setHours(22, 0, 0, 0);
          if (ende.getTime() - t >= 6 * STD) neueSchicht();
          t = ende.getTime(); lenkHeute = 0; seitPause = 0; continue;
        }
        if (lenkHeute >= 9) { neueSchicht(); t += 11 * STD; lenkHeute = 0; seitPause = 0; continue; }
        if (seitPause >= 4.5) { t += 0.75 * STD; einsatz += 0.75; seitPause = 0; continue; }
        const stueck = Math.min(rest, 4.5 - seitPause, 9 - lenkHeute);
        t += stueck * STD; einsatz += stueck; lenkHeute += stueck; seitPause += stueck; rest -= stueck;
      }
    };
    // Warten vor dem Beladen zählt erst ab 6 Uhr am Ladetag – freie Zeit an den Tagen davor
    // kann der LKW noch anders nutzen. Warten mit Ladung an Bord zählt voll.
    const warteBis = (ziel, nurAmLadetag) => {
      if (ziel <= t) return;
      let von = t;
      if (nurAmLadetag) { const tag = new Date(ziel); tag.setHours(6, 0, 0, 0); von = Math.max(t, Math.min(ziel, tag.getTime())); }
      // Warten mit Ladung über Nacht (z. B. nachts ankommen, morgens entladen) = neuer Einsatztag.
      // Vor dem Beladen nicht: die Anfahrt fährt man dann einfach am Ladetag.
      if (!nurAmLadetag && ((ziel - t) / STD >= 9 || nachtStunden(t, ziel) >= 3)) neueSchicht();
      const h = arbeitsStunden(von, ziel);
      einsatz += h; warteH += h;
      if ((ziel - t) / STD >= 9) { lenkHeute = 0; seitPause = 0; }
      t = ziel;
      return h;
    };

    fahre(erg.leerKm);
    for (let i = 0; i < plaetze.length; i++) {
      const p = plaetze[i];
      const laden = p.loadingType === 'LOADING';
      // „12.11.–15.11., 08–16 Uhr“ heißt: an jedem dieser Tage nur von 8 bis 16 Uhr
      const fenster = zeitfenster(p);
      if (ohneUhrzeit(p)) erg.zeitUnklar = true; // Lade- oder Entladezeit nicht angegeben
      let f = fenster.find((w) => t <= w.bis);
      // Kein Fenster mehr offen, aber höchstens „Puffer“ zu spät → noch melden, mit Hinweis „Dispo fragen“
      if (!f && einst.pufferMin > 0) {
        const g = fenster.filter((w) => t <= w.bis + einst.pufferMin * MIN).pop();
        if (g) { f = g; (erg.knapp = erg.knapp || []).push({ laden: laden, ankunft: t, schluss: g.bis }); }
      }
      if (!f) {
        return Object.assign(erg, { machbar: false, grund: (laden ? 'Ladefenster' : 'Entladefenster') + ' nicht erreichbar' });
      }
      if (t < f.von) { const h = warteBis(f.von, i === 0); if (i === 0) erg.warteVorLaden = h || 0; }
      else if (i === 0) erg.warteVorLaden = 0;
      if (i === 0) erg.ankunftLaden = t;
      const dauer = laden ? einst.ladezeit : einst.entladezeit;
      t += dauer * STD; einsatz += dauer;
      if (i < abschnitte.length) fahre(lastKmAbschnitt[i]);
    }
    erg.ende = t;

    // Leer zurück zum heutigen Standort des LKW (RIO-Position, sonst Startort der Suche) – für 🔁
    const letzterOrt = koord(plaetze[plaetze.length - 1]);
    erg.rueckKm = routen && routen.rueck != null ? routen.rueck : (pos && letzterOrt ? kmLuft(letzterOrt, pos) * einst.umwegFaktor : 0);
    erg.zielHeimKm = letzterOrt ? kmLuft(letzterOrt, heimPos()) : null; // Luftlinie vom Ziel bis zur Heimat (Duisburg)
    const einsatzVorRueck = einsatz, schichtenVorRueck = schichten;
    fahre(erg.rueckKm);
    erg.zurueck = t;
    const einsatzRueck = einsatz - einsatzVorRueck, schichtenRueck = schichten - schichtenVorRueck;
    t = erg.ende; einsatz = einsatzVorRueck; schichten = schichtenVorRueck;

    // Reiter bestimmen: 🔁 Nacht + zurück, 🌙 Nacht, ☀️ heute leer, sonst 🛣️ Fern oder 📋 Weitere
    const uhrAm = (basis, tagePlus, stunde) => { const d = new Date(basis); d.setDate(d.getDate() + tagePlus); d.setHours(stunde, 0, 0, 0); return d.getTime(); };
    const gleicherTag = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
    const ladeHeute = gleicherTag(erg.ankunftLaden, startMs);
    const ladeStunde = new Date(erg.ankunftLaden).getHours();
    const nachtsFertig = t > uhrAm(startMs, 0, 20) && t <= uhrAm(startMs, 1, einst.nachtFertigBis);
    const istRund = pos && ladeHeute && ladeStunde >= einst.rundLadenAb && nachtsFertig &&
      erg.zurueck <= uhrAm(startMs, 1, einst.rundZurueckBis);
    // 🌙 heute geladen (egal wann), abends oder nachts entladen
    const istNacht = ladeHeute && ladeStunde >= (einst.nachtLadenAb || 0) &&
      t > uhrAm(startMs, 0, einst.nachtAbendsAb) && t <= uhrAm(startMs, 1, einst.nachtFertigBis);
    const istHeute = t <= uhrAm(startMs, 0, einst.heuteFertigBis) &&
      erg.leerKm <= einst.heuteMaxLeerKm && erg.lastKm <= einst.heuteMaxLastKm;

    // Kosten = km × Satz + Tage × Fixkosten. Zusatztouren (☀️/🌙/🔁) nur anteilig, sonst mind. ein Tagessatz.
    // Nacht-Touren: Warten bis zum Beladen zählt nicht – der LKW fährt tagsüber anderes.
    const rechne = (mitRueck, ohneWarten, anteilig) => {
      const abzug = ohneWarten ? (erg.warteVorLaden || 0) : 0;
      const h = einsatz - abzug + (mitRueck ? einsatzRueck : 0);
      const tageRoh = h / einst.stundenProTag;
      const schichtenGes = schichten + (mitRueck ? schichtenRueck : 0);
      let tage = einst.mindestensEinTag && !anteilig ? Math.max(1, tageRoh) : tageRoh;
      if (einst.volleTage && !anteilig) tage = Math.max(tage, schichtenGes); // jeder Einsatztag voll
      // Laden und vor 6 Uhr am nächsten Morgen fertig entladen (Nachttour) = nur 1 Fahrertag
      if (!anteilig && erg.ankunftLaden && erg.ende <= uhrAm(erg.ankunftLaden, 1, 6)) tage = 1;
      const km = erg.leerKm + erg.lastKm + (mitRueck ? erg.rueckKm : 0);
      // Folgetour: Der erste (heutige) Fahrertag ist schon bezahlt – davon nur noch der eingestellte Anteil
      const folge = folgetourAktiv() && erg.ankunftLaden && new Date(erg.ankunftLaden).toDateString() === new Date().toDateString();
      const tageKosten = folge ? Math.max(0, tage - 1) + Math.min(1, tage) * (Number(einst.folgetourAnteil) || 0) / 100 : tage;
      if (folge) erg.folgetour = true;
      const kosten = km * einst.kostenProKm + tageKosten * einst.fixkostenProTag;
      return { einsatzStunden: h, warteStunden: warteH - abzug, tage: tage, kosten: kosten, schichten: schichtenGes,
        deckung: preisEur ? preisEur / kosten * 100 : null };
    };
    const anteilig = !!einst.zusatzOhneTagessatz;
    let kat = null, r = null;
    // ☀️ zuerst: was heute (bis Mitternacht) fertig wird, ist eine Heute-Tour – auch wenn es abends spät wird
    if (istHeute) { kat = 'heute'; r = rechne(false, false, anteilig); }
    if (!kat && istRund) {
      const rr = rechne(true, true, anteilig);
      if (rr.deckung === null || rr.deckung >= einst.rundMinDeckung) { kat = 'rund'; r = rr; erg.mitRueck = true; }
    }
    if (!kat && istNacht) { kat = 'nacht'; r = rechne(false, true, anteilig); }
    if (!kat) r = rechne(false, false, false);
    Object.assign(erg, r);
    // Kurze Tour, danach noch am selben Tag leer zurück zum Standort (keine Übernachtung): Heimfahrt gehört zu den Kosten
    const heimHeute = !!pos && !!erg.ankunftLaden && gleicherTag(erg.ankunftLaden, erg.ende) && gleicherTag(erg.ankunftLaden, erg.zurueck) &&
      erg.zurueck <= uhrAm(erg.ankunftLaden, 0, einst.heuteFertigBis || 24) &&
      erg.ende >= uhrAm(erg.ankunftLaden, 0, Number(einst.heimfahrtAb) || 0); // erst nachmittags fertig: danach geht's heim
    if (einst.heimfahrtEinrechnen !== false && heimHeute && !erg.mitRueck) {
      Object.assign(erg, rechne(true, kat === 'nacht', kat ? anteilig : false));
      erg.mitRueck = true; erg.heimEingerechnet = true;
    }
    erg.preis = preisEur;
    if (!kat) kat = erg.lastKm >= einst.fernAbKm && erg.deckung !== null && erg.deckung >= einst.fernMinDeckung ? 'fern' : 'sonst';
    erg.kategorie = kat;
    erg.mindestpreis = erg.kosten * minDeckungFuer(kat) / 100;
    // Tagestour (Laden und Entladen am selben Tag): Kosten auch inkl. Leerfahrt zurück zum Standort – für 🟢
    erg.tagestour = !!pos && !!erg.ankunftLaden && gleicherTag(erg.ankunftLaden, erg.ende);
    if (erg.tagestour) {
      const rh = rechne(true, false, false); erg.deckungHeim = rh.deckung; erg.kostenHeim = rh.kosten;
      // Deckt die Tagestour auch mit der Leerfahrt heim noch alles, rechnet der Wächter genau so (dann gibt es auch keinen
      // Rückladungs-Check): Farbe, % und „über Kosten“ gelten inkl. Leerfahrt heim. Ohne Leerfahrt steht nur noch als Info dabei.
      const zielNah = erg.zielHeimKm != null && erg.zielHeimKm <= (einst.heimRadius || 0);
      if (!erg.mitRueck && einst.heimfahrtEinrechnen !== false && rh.deckung != null && rh.deckung >= einst.tagestourGruenAb && !zielNah) {
        erg.deckungOhneHeim = erg.deckung;
        erg.einfach = { einsatzStunden: erg.einsatzStunden, warteStunden: erg.warteStunden, tage: erg.tage, kosten: erg.kosten, schichten: erg.schichten, deckung: erg.deckung, mindestpreis: erg.mindestpreis };
        Object.assign(erg, rh);
        erg.mitRueck = true; erg.heimEingerechnet = true;
        erg.mindestpreis = erg.kosten * minDeckungFuer(kat) / 100;
      }
    }
    return erg;
  }

  // ------------------- LKW-Routen (openrouteservice, Profil 40-Tonner) -------------------
  // Nur für Angebote, die gemeldet werden sollen – nicht für die ganze Liste. Ergebnisse werden 14 Tage gemerkt.
  const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-hgv';
  async function lkwKm(a, b) {
    if (!einst.lkwRouting || !String(einst.orsKey || '').trim() || !a || !b) return null;
    const r2 = (x) => Math.round(x * 100) / 100; // ca. 1 km Raster
    const schluessel = [r2(a.lat), r2(a.lon), r2(b.lat), r2(b.lon)].join(',');
    const cache = lade('lkwRouten', {});
    if (cache[schluessel] && Date.now() - cache[schluessel].t < 14 * 24 * STD) return cache[schluessel].km;
    if (kmLuft(a, b) < 1) return 0;
    const tag = new Date().toDateString();
    const z = lade('orsZaehler', { tag: tag, n: 0 });
    if (z.tag !== tag) { z.tag = tag; z.n = 0; }
    if (z.n >= (Number(einst.orsProTag) || 180)) return null; // Tageskontingent aufgebraucht → Schätzung
    z.n++; speichere('orsZaehler', z);
    const r = await meinFetch(ORS_URL, {
      method: 'POST', headers: { 'Authorization': String(einst.orsKey).trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [[a.lon, a.lat], [b.lon, b.lat]], units: 'km', instructions: false, geometry: false,
        options: { vehicle_type: 'hgv', profile_params: { restrictions: { weight: 40, height: 4, width: 2.55, length: 16.5, axleload: 11.5 } } } }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const km = j && j.routes && j.routes[0] && j.routes[0].summary && j.routes[0].summary.distance;
    if (typeof km !== 'number') return null;
    cache[schluessel] = { km: km, t: Date.now() };
    const alle = Object.keys(cache);
    if (alle.length > 800) alle.sort((x, y) => cache[x].t - cache[y].t).slice(0, alle.length - 800).forEach((k) => { delete cache[k]; });
    speichere('lkwRouten', cache);
    return km;
  }
  // Angebot mit echten LKW-Routen für Anfahrt (und ggf. Heimweg) neu bewerten
  async function mitLkwRoute(n, posAlle, start) {
    if (!einst.lkwRouting || !posAlle || !n.b) return;
    const pl = n.o.loadingplaces || [];
    const erster = koord(pl[0]), letzter = koord(pl[pl.length - 1]);
    const pos = naechsterStart(posAlle, erster);
    try {
      const leer = erster ? await lkwKm(pos, erster) : null;
      const rueck = (n.b.mitRueck || n.b.tagestour || n.b.kategorie === 'rund') && letzter ? await lkwKm(letzter, pos) : null;
      if (leer == null && rueck == null) return;
      const b2 = bewerte(n.o, pos, start, { leer: leer, rueck: rueck });
      if (b2.machbar) n.b = b2;
    } catch (e) { /* dann bleibt die Schätzung */ }
  }
  // Weg zur Folgeladung ebenfalls als LKW-Route
  async function anschlussMitRoute(n) {
    const an = n.anschluss;
    if (!einst.lkwRouting || !an || !n.b) return;
    const pl = n.o.loadingplaces || [], apl = an.o.loadingplaces || [];
    const ziel = koord(pl[pl.length - 1]), start = koord(apl[0]);
    try {
      const leer = await lkwKm(ziel, start);
      if (leer == null) return;
      const b2 = bewerte(an.o, ziel, n.b.ende, { leer: leer });
      if (b2.machbar && b2.deckung !== null) n.anschluss = { o: an.o, b: b2 };
    } catch (e) { /* egal */ }
  }
  // Nach der Routen-Korrektur: passt das Angebot noch?
  // ↩ Weit weg: Ziel mehr als rueckPflichtAbKm (Luftlinie) von zu Hause – dann wird der Rückweg immer geprüft
  const rueckVersuche = {};
  function istWeit(b) {
    const grenze = Number(einst.rueckPflichtAbKm) || 0;
    if (!grenze || !b) return false;
    const e = (b.punkte || []).filter((p) => p.typ === 'E').pop();
    return !!(e && e.k && kmLuft(e.k, heimPos()) > grenze);
  }
  // 🤏 Knapp unter der Grenze (z. B. 90–95 %): trotzdem melden – still und mit Preisvorschlag zum Nachverhandeln
  const knappMoeglich = (n) => Number(einst.knappAb) > 0 && n.b.deckung !== null && n.b.deckung >= Number(einst.knappAb) && !zuWenigProKm(n.b);
  const preis100 = (b) => b.preis && b.deckung ? b.preis * 100 / b.deckung : 0;
  const knappVorschlag = (b) => Math.ceil(preis100(b) * 1.05 / 10) * 10; // ca. 105 %, auf 10 € aufgerundet
  function nochPassend(n) {
    if (n.stamm) return true;
    if (n.b.deckung !== null && n.b.deckung < minDeckungFuer(n.b.kategorie)) return false;
    if (zuWenigProKm(n.b)) return false;
    return true;
  }

  // Ab welcher Deckung je Reiter gemeldet wird
  function minDeckungFuer(kat) {
    const tol = Number(einst.toleranz) || 0; // Puffer: knapp darunter zählt noch
    if (kat === 'rund') return einst.rundMinDeckung - tol;
    if (kat === 'heute' || kat === 'nacht') return einst.zusatzMinDeckung - tol;
    return einst.minDeckung - tol;
  }
  // Erlös je gefahrenem km (Anfahrt + Tour, bei 🔁 auch Rückfahrt)
  const euroProKm = (b) => b.preis / Math.max(1, b.leerKm + b.lastKm + (b.mitRueck ? b.rueckKm : 0));
  const zuWenigProKm = (b) => !!b.preis && euroProKm(b) < (einst.minEuroKm || 0);
  const ohnePreisErlaubt = (o, b) => einst.ohnePreisMelden &&
    ((b.kategorie === 'heute' && einst.heuteOhnePreisAlle) || (o.freightLengthInMeters || 0) >= einst.ohnePreisAbLdm);

  // Ausländische Firmen erkennen (erlaubt: DE, AT, NL – einstellbar).
  // Ohne Abfrage: Rechtsform im Namen. Nach dem Kontaktabruf zusätzlich: USt-ID, Firmensitz, Vorwahl der Zentrale.
  const AUSLAND_NAME = [
    [/\bsp\.?\s*z\s*o\.?\s*o\b|\bsp\.\s*[jkp]\.|\bsp[oó][lł]ka\b/i, 'PL'],
    [/\bs\.\s?r\.\s?o\b|\bspol\.\s*s\s*r\.?\s*o\b|\ba\.\s?s\.?\s*$/i, 'CZ/SK'],
    [/\b(kft|zrt|nyrt)\b\.?/i, 'HU'],
    [/\bs\.?\s?r\.?\s?l\.?\s*$|\bs\.c\.\s/i, 'RO/IT'],
    [/\bs\.p\.a\b|\bs\.n\.c\b/i, 'IT'],
    [/\bd\.\s?o\.\s?o\b|\bdooel\b/i, 'Balkan'],
    [/\b(e?ood|ead)\b|ЕООД|ООД/i, 'BG'],
    [/\buab\b|\s(mb)\s*$/i, 'LT'],
    [/(^|\s)sia(\s|$)/i, 'LV'],
    [/\s(oü|ou)\s*$/i, 'EE'],
    [/\b(tov|fop)\b|ТОВ|ФОП/i, 'UA'],
    [/\b(sarl|sas|eurl|s\.a\.s|s\.à\s?r\.l)\b\.?/i, 'FR/LU'],
    [/\bs\.?\s?l\.?\s?u?\.?\s*$|\blda\.?\s*$/i, 'ES/PT'],
    [/\bs\.\s?a\.\s*$|\bsa\s*$/i, 'Ausland'],
    [/\b(aps|a\/s|as|oy|oyj|ab)\.?\s*$/i, 'Skandinavien'],
    [/\b(ltd|limited|plc|llc|inc)\.?\s*$/i, 'UK/Übersee'],
    [/ş(ti|tİ)|\ba\.ş\b/i, 'TR'],
  ];
  const VORWAHL = { 49: 'DE', 43: 'AT', 31: 'NL', 41: 'CH', 48: 'PL', 420: 'CZ', 421: 'SK', 36: 'HU', 40: 'RO', 359: 'BG', 370: 'LT',
    371: 'LV', 372: 'EE', 380: 'UA', 375: 'BY', 33: 'FR', 32: 'BE', 352: 'LU', 39: 'IT', 34: 'ES', 351: 'PT', 45: 'DK', 46: 'SE',
    47: 'NO', 358: 'FI', 44: 'GB', 353: 'IE', 386: 'SI', 385: 'HR', 381: 'RS', 387: 'BA', 389: 'MK', 30: 'GR', 90: 'TR', 373: 'MD' };
  const erlaubt = () => String(einst.erlaubteLaender || 'DE').toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  // Gibt das Land zurück, wenn die Firma ausgeschlossen werden soll – sonst null
  function auslandLand(o, d) {
    if (!einst.auslandAusschliessen) return null;
    const ok = erlaubt();
    const cu = (d && d.customer) || {};
    // 1. USt-ID (z. B. DE123…, ATU…, NL…B01) – am sichersten
    const ust = String(cu.taxId || cu.vatId || '').toUpperCase().match(/([A-Z]{2})(?=U?\d)/);
    if (ust) return ok.includes(ust[1]) ? null : ust[1];
    // 2. Firmensitz laut Timocom
    const ad = cu.address || {};
    const sitz = state.laender[ad.countryId] || String(ad.countryCode || ad.isoCode || '').toUpperCase();
    if (/^[A-Z]{1,3}$/.test(sitz)) return ok.includes(sitz) ? null : sitz;
    // 3. Vorwahl der Zentrale (nicht des Disponenten – der kann auch im Ausland sitzen)
    const tel = String(cu.phone || '').replace(/[\s()/-]/g, '').replace(/^00/, '+');
    if (/^\+\d/.test(tel)) {
      const land = VORWAHL[tel.slice(1, 4)] || VORWAHL[tel.slice(1, 3)] || VORWAHL[tel.slice(1, 2)] || 'Ausland';
      return ok.includes(land) ? null : land;
    }
    // 4. Rechtsform im Namen
    const name = String(cu.name || (o && o.customerName) || '');
    for (const [re, land] of AUSLAND_NAME) if (re.test(name)) return land;
    return null;
  }

  // Sonderfracht erkennen (Übermaß, verbreiterbarer Auflieger …): alle Texte des Angebots durchsuchen –
  // Warenart, Zusatzinfo, Bemerkungen, Fahrzeuganforderungen. Gibt das gefundene Wort zurück, sonst null.
  const normal = (x) => String(x).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  function textwerte(x, aus, tiefe) {
    if (x == null || tiefe > 6) return aus;
    if (typeof x === 'string') aus.push(x);
    else if (Array.isArray(x)) x.forEach((v) => textwerte(v, aus, tiefe + 1));
    else if (typeof x === 'object') Object.keys(x).forEach((k) => {
      if (/id$/i.test(k)) return; // Kennungen (Angebots-ID usw.) sind kein Text
      if (x[k] === true) aus.push(k);
      textwerte(x[k], aus, tiefe + 1);
    });
    return aus;
  }
  // Nur echter Freitext für Wortprüfungen (ADR, Sonderfracht, Gewicht): Warenart, Bemerkungen, Zusatzinfos.
  // Keine Firmen-/Personennamen, Adressen, Links, E-Mails, Telefonnummern, Datumswerte oder Kennungen –
  // sonst schlägt z. B. eine Webseite „adr-spedition.de“, ein Link mit „…&adr=false“ oder ein Zeitstempel „…-26T08:15“ an.
  const FREITEXT_OHNE_ZWEIG = /^(customer|contactperson|contactpersons|contactchannels|address|coordinate|payment|route|company|companydata|customerdata|links?)$/i;
  const FREITEXT_OHNE_FELD = /(url|uri|link|logo|e?mail|phone|tel|fax|mobile|name|city|zip|street|country|date|time|since|id|ids|language|languages|currency|rating)$/i;
  const OHNE_WERT = /^(https?:|www\.)|@|^\+?[\d\s/()-]{7,}$|^\d{4}-\d{2}-\d{2}/i;
  function freitexte(x, aus, tiefe, feld) {
    if (x == null || tiefe > 7) return aus;
    if (typeof x === 'string') { if (!(feld && FREITEXT_OHNE_FELD.test(feld)) && !OHNE_WERT.test(x.trim())) aus.push(x); return aus; }
    if (Array.isArray(x)) { x.forEach((v) => freitexte(v, aus, tiefe + 1, feld)); return aus; }
    if (typeof x === 'object') Object.keys(x).forEach((k) => {
      if (FREITEXT_OHNE_ZWEIG.test(k)) return;
      if (x[k] === true && /adr|gefahr|hazard|dangerous/i.test(k)) aus.push(k); // z. B. „dangerousGoods: true“
      freitexte(x[k], aus, tiefe + 1, k);
    });
    return aus;
  }
  const freitextVon = (o, d) => normal(freitexte(o, [], 0, '').concat(d ? freitexte(d, [], 0, '') : []).join(' | '));
  // „kein …“, „ohne …“, „non-…“ davor oder „… nein“, „…-frei“, „… nicht erforderlich“ dahinter → zählt nicht
  const VERNEINT_DAVOR = /(?:kein|keine|keinen|keiner|ohne|nicht|no|non|frei von|not|w\/o)[\s:.-]*$/;
  const VERNEINT_DANACH = /^(?:[\s:=-]*(?:nein|no|none|keins?|0|nicht|not|frei|free)(?![a-z0-9])|frei|free|-frei|-free)/;
  function verneint(text, start, ende) {
    if (VERNEINT_DAVOR.test(text.slice(Math.max(0, start - 18), start).trim())) return true;
    return VERNEINT_DANACH.test(text.slice(ende, ende + 16));
  }
  function sonderfracht(o, d) {
    const woerter = String(einst.ausschlussWoerter || '').split(/[,;\n]+/).map((w) => w.trim()).filter((w) => w.length >= 3);
    if (!woerter.length) return null;
    const text = freitextVon(o, d);
    for (const w of woerter) {
      const nw = normal(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]*');
      const re = new RegExp('(?:^|[^a-z0-9])(' + nw + ')', 'g');
      let m;
      while ((m = re.exec(text))) {
        const start = m.index + m[0].length - m[1].length, ende = start + m[1].length;
        // kurze Wörter („A-Schild“) nur als ganzes Wort; nicht, wenn verneint („kein Tieflader nötig“, „Überbreite: nein“)
        if (m[1].length <= 8 && /[a-z0-9]/.test(text.charAt(ende))) continue;
        if (verneint(text, start, ende)) continue;
        return w;
      }
    }
    return null;
  }

  // ⚠️ Gefahrgut (ADR): steht es irgendwo im Angebot – auch nur in der Bemerkung („ADR-Gut“, „Gefahrgut Klasse 3“, „UN 1263“)?
  // Verneinungen wie „kein ADR“, „ohne Gefahrgut“, „non ADR“ zählen nicht. Kurze Wörter nur als ganzes Wort (nicht „Adresse“).
  const GEFAHR_RE = /(?:^|[^a-z0-9])(adr|gefahrgut\w*|gefahrstoff\w*|gefahrenklasse|gefaehrliche[sn]? gueter|gefaehrliches gut|dangerous ?goods?|hazardous|hazmat|un[- ]?nr\.?\s?\d{4}|un[- ]?nummer|un\s?\d{4})(?![a-z0-9])/g;
  function gefahrgut(o, d) {
    if (einst.gefahrgutAusschliessen === false) return null;
    const text = freitextVon(o, d);
    GEFAHR_RE.lastIndex = 0;
    let m;
    while ((m = GEFAHR_RE.exec(text))) {
      const start = m.index + m[0].length - m[1].length, ende = m.index + m[0].length;
      if (/frei$|free$/.test(m[1])) continue; // „gefahrgutfrei“
      if (verneint(text, start, ende)) continue; // „kein ADR“, „ADR: nein“, „ADR-frei“, „ADR nicht erforderlich“
      return m[1].trim();
    }
    return null;
  }

  // ------------------------- Passt die Fracht zu uns? -------------------------
  const DE_ID = 671; // Timocom-Länderkennung für Deutschland
  // Lade- oder Entladestelle außerhalb Deutschlands → Land zurückgeben, sonst null
  function auslandsTour(o) {
    if (!einst.nurDeutschland) return null;
    for (const p of o.loadingplaces || []) {
      const id = p && p.address && p.address.countryId;
      if (id == null || String(id) === String(DE_ID) || state.laender[id] === 'DE') continue;
      return state.laender[id] || 'Ausland';
    }
    return null;
  }
  const namensListe = (s) => String(s || '').split(/[,;\n]+/).map((w) => normal(w.trim())).filter((w) => w.length >= 3);
  const firmenText = (o, d) => normal([(d && d.customer && d.customer.name) || '', (o && o.customerName) || ''].join(' | '));
  const aufSperrliste = (o, d) => { const t = firmenText(o, d); return namensListe(einst.sperrFirmen).some((w) => t.indexOf(w) !== -1); };
  const istStamm = (o, d) => { const t = firmenText(o, d); return namensListe(einst.stammFirmen).some((w) => t.indexOf(w) !== -1); };

  // Grund, warum ein Angebot für uns nicht in Frage kommt – sonst null
  // Gewicht, das nur im Beschreibungstext steht („33 tons“, „26 t“, „33.000 kg“) – das Gewichtsfeld ist manchmal kleiner.
  // 40 t / 44 t sind fast immer die LKW-Klasse („40-Tonner“), nicht das Ladungsgewicht – die zählen nicht.
  function gewichtImText(o, d) {
    // Zeitstempel („2026-11-26T08:15:00“) und Datumsangaben („26.11.“) vorher entfernen – sonst wird aus dem 26. ein „26 t“
    const text = freitextVon(o, d)
      .replace(/\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?/g, ' ')
      .replace(/(^|[^\d.,])\d{1,2}\.\d{2}\.(?:\d{2,4})?/g, '$1 ');
    let max = 0;
    const re1 = /(?:^|[^\d.,])(\d{1,2}(?:[.,]\d{1,3})?)\s*(?:t|to|tons?|tonnen?|tonne)(?![a-z0-9])/g;
    const re2 = /(?:^|[^\d.,])(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})\s*(?:kg|kilo)(?![a-z0-9])/g;
    let m;
    while ((m = re1.exec(text))) { const t = Number(m[1].replace(',', '.')); if (t !== 40 && t !== 44 && t > max) max = t; }
    while ((m = re2.exec(text))) { const t = Number(m[1].replace(/[.\s]/g, '')) / 1000; if (t !== 40 && t !== 44 && t <= 60 && t > max) max = t; }
    return max;
  }
  // Anzahl Lade- und Entladestellen eines Angebots
  function stellenZahl(o) {
    const pl = (o && o.loadingplaces) || [];
    const l = pl.filter((p) => p && p.loadingType === 'LOADING').length;
    return { l: l, e: pl.length - l };
  }
  function ausschluss(o, d) {
    const al = auslandLand(o, d);
    if (al) return 'Firma aus ' + al;
    const at = auslandsTour(o);
    if (at) return 'Tour ins Ausland (' + at + ')';
    const t = o.freightWeightInTons || 0;
    if (einst.maxGewicht > 0 && t > einst.maxGewicht) return zahl(t, 1) + ' t – über Nutzlast';
    const tText = einst.maxGewicht > 0 ? gewichtImText(o, d) : 0;
    if (tText > einst.maxGewicht) return zahl(tText, 1) + ' t laut Beschreibung – über Nutzlast';
    if ((o.freightLengthInMeters || 0) > 13.6) return zahl(o.freightLengthInMeters, 1) + ' m – zu lang';
    const st = stellenZahl(o);
    if (Number(einst.maxLadestellen) > 0 && st.l > Number(einst.maxLadestellen)) return st.l + ' Ladestellen – zu viele';
    if (Number(einst.maxEntladestellen) > 0 && st.e > Number(einst.maxEntladestellen)) return st.e + ' Entladestellen – zu viele';
    const gg = gefahrgut(o, d);
    if (gg) return 'Gefahrgut („' + gg + '“) – kein ADR';
    const sw = sonderfracht(o, d);
    if (sw) return '„' + sw + '“';
    if (aufSperrliste(o, d)) return 'Firma auf Sperrliste';
    return null;
  }

  // Ladungen, für die unsere Auflieger besonders passen (weniger Mitbieter): Getränke, Code XL, Zoll
  const MERKMALE = [
    ['Getränke', /getraenk|beverage|\bbier\b|mineralwasser|leergut/],
    ['Code XL', /code[\s_-]?xl/],
    ['Zoll', /zollschnur|zollverschluss|zollgut|zollplomb|\bzoll\b|\bt1\b|\btir\b|unverzollt|customs/],
  ];
  function merkmale(o, d) {
    const text = normal(textwerte(o, [], 0).concat(d ? textwerte(d, [], 0) : []).join(' | '));
    return MERKMALE.filter(([, re]) => re.test(text)).map(([name]) => name);
  }

  // Wert irgendwo im Angebot suchen (Timocom liefert je nach Angebot unterschiedliche Felder)
  function sucheWert(x, test, tiefe) {
    tiefe = tiefe || 0;
    if (!x || typeof x !== 'object' || tiefe > 6) return null;
    for (const k of Object.keys(x)) {
      try { if (test(k, x[k])) return x[k]; } catch (e) { /* egal */ }
      const r = sucheWert(x[k], test, tiefe + 1);
      if (r != null) return r;
    }
    return null;
  }
  function zahlungsziel(d) {
    if (!d) return null;
    if (d.payment && d.payment.paymentDueWithinDays > 0) return d.payment.paymentDueWithinDays;
    return sucheWert(d, (k, v) => typeof v === 'number' && v > 0 && v <= 180 &&
      /payment|zahlung|due/i.test(k) && /day|tage|within|due|ziel/i.test(k));
  }
  const MAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;
  // E-Mail eines anderen (nicht die eigene von MZ Transport, keine Timocom-Systemadresse)
  const fremdeMail = (v) => typeof v === 'string' && MAIL_RE.test(v.trim()) && !/timocom\.|@mz-transport\.de$/i.test(v.trim());
  function emailVon(d) {
    if (!d) return null;
    const t = (k, v) => fremdeMail(v);
    const v = sucheWert(d.contactPerson, t) || sucheWert(d.customer, t) || sucheWert(d, t);
    return v ? v.trim() : null;
  }

  // ------------------- E-Mail-Adresse: Quelle bei Timocom lernen -------------------
  // Timocom liefert die E-Mail des Ansprechpartners erst, wenn man bei einem Angebot die „Kontaktangaben“ aufklappt.
  // Der Wächter schaut dabei einmal zu, merkt sich, welche Abfrage die Adresse liefert, und holt sie danach selbst.
  // zuletzt in Timocom geöffnete Angebote: [{ id, d, z }] – gespeichert, damit es auch klappt, wenn das Firmenprofil in einem neuen Tab aufgeht
  const mailSpur = { details: lade('mailSpur', []) };
  let mailQuelle = lade('mailQuelle', null); // { vorlage: '/app/…/{wert}/…', feld: 'contactPerson.id' | '#angebot', t }
  function skalare(x, pfad, aus, tiefe) {
    if (x == null || tiefe > 5) return aus;
    if (typeof x === 'string' || typeof x === 'number') { const v = String(x); if (v.length >= 4 && v.length <= 80) aus.push({ pfad: pfad, wert: v }); return aus; }
    if (Array.isArray(x)) { x.slice(0, 5).forEach((v, i) => skalare(v, pfad + '.' + i, aus, tiefe + 1)); return aus; }
    if (typeof x === 'object') Object.keys(x).forEach((k) => skalare(x[k], pfad ? pfad + '.' + k : k, aus, tiefe + 1));
    return aus;
  }
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const istAngebot = (b) => !!(b && typeof b === 'object' && (b.loadingplaces || b.publicOfferId));
  // Kennung des Ansprechpartners im Angebot (z. B. contactPerson.id als UUID)
  function kontaktUuid(d) {
    const w = skalare(d, '', [], 0).filter((v) => UUID_RE.test(v.wert));
    const k = w.find((v) => /contact|person|kontakt/i.test(v.pfad));
    return k ? k.wert : null;
  }
  // Aufbau einer Antwort ohne persönliche Daten (für die Diagnose): Namen, E-Mails, Telefonnummern werden ersetzt
  function skelett(x, tiefe) {
    tiefe = tiefe || 0;
    if (x == null || typeof x === 'boolean') return x;
    if (tiefe > 7) return '…';
    if (Array.isArray(x)) return x.length ? [skelett(x[0], tiefe + 1), '×' + x.length] : [];
    if (typeof x === 'object') { const o = {}; Object.keys(x).slice(0, 50).forEach((k) => { o[k] = skelett(x[k], tiefe + 1); }); return o; }
    if (typeof x === 'number') return x;
    const v = String(x);
    if (UUID_RE.test(v)) return 'UUID:' + v.slice(0, 8);
    if (MAIL_RE.test(v.trim())) return 'EMAIL';
    if (/^\+?[\d\s/()-]{6,}$/.test(v)) return 'TEL';
    if (/^[0-9a-f]{6,}$/i.test(v) || /^\d+$/.test(v)) return 'ID:' + v;
    if (/^[A-Z0-9_]{1,16}$/.test(v)) return v;
    return 'TEXT' + v.length;
  }
  function diagMerken(eintrag) {
    try {
      const log = lade('mailDiag', []);
      log.unshift(eintrag);
      let txt = JSON.stringify(log.slice(0, 40));
      while (txt.length > 400000 && log.length > 5) { log.pop(); txt = JSON.stringify(log); }
      speichere('mailDiag', log.slice(0, 40));
    } catch (e) { /* egal */ }
  }
  async function diagnoseSenden() {
    const spur = lade('mailSpur', []).map((x) => ({ id: x.id, d: skelett(x.d), z: skelett(x.z) }));
    const daten = { version: '4.5', zeit: new Date().toString(), mailQuelle: lade('mailQuelle', null), eigenesDetail: lade('mailDiagEigen', null),
      geoeffneteAngebote: spur, abfragen: lade('mailDiag', []) };
    const r = await meinFetch(CONFIG.NTFY_SERVER + '/' + CONFIG.NTFY_KANAL + '-diag', { method: 'PUT', body: JSON.stringify(daten), headers: ntfyHeaders({ 'Filename': 'diagnose.json' }) });
    return r.ok;
  }
  const holeFeld = (x, pfad) => String(pfad).split('.').reduce((a, k) => (a == null ? a : a[k]), x);
  function mailBeobachte(methode, url, status, antwort) {
    if (status !== 200 || antwort == null) return;
    // relative Adressen (z. B. „files-view/…“) so auflösen, wie der Browser es tut
    let pfad = String(url);
    try { const u = new URL(pfad, document.baseURI || location.href); if (u.host !== location.host) return; pfad = u.pathname + u.search; } catch (e) { pfad = pfad.replace(/^https?:\/\/[^/]+/, ''); }
    if (typeof antwort === 'string' && (antwort.length > 300000 || !/^\s*[[{]/.test(antwort))) return;
    let j; try { j = typeof antwort === 'string' ? JSON.parse(antwort) : antwort; } catch (e) { return; }
    if (!j || typeof j !== 'object') return;
    mailSpur.letzte = [{ pfad: pfad, j: j }].concat(mailSpur.letzte || []).slice(0, 25); // letzte Antworten in diesem Tab
    diagMerken({ t: new Date().toTimeString().slice(0, 8), seite: location.pathname + location.search.slice(0, 80), m: String(methode).toUpperCase(),
      p: pfad.slice(0, 200), mail: !!sucheWert(j, (k, v) => fremdeMail(v)), s: JSON.stringify(skelett(j)).slice(0, 6000) });
    const det = pfad.match(/freight-search-offers\/([^/?#]+)(?:[?#]|$)/);
    const basis = j.invocationResult || j;
    if (String(methode).toUpperCase() === 'GET' && (det || (istAngebot(basis) && basis.publicOfferId && basis.loadingplaces))) {
      const id = det ? decodeURIComponent(det[1]) : String(basis.publicOfferId);
      mailSpur.details = [{ id: id, d: j.invocationResult || j, z: state.letzteZeilen.get(id) || null }]
        .concat(mailSpur.details.filter((x) => x.id !== id)).slice(0, 6);
      speichere('mailSpur', mailSpur.details);
    }
    const mail = sucheWert(j, (k, v) => fremdeMail(v));
    if (!mail) return;
    state.mailHinweis = 'zuletzt gesehen: ' + String(methode).toUpperCase() + ' ' + pfad.split('?')[0].slice(-110);
    speichere('mailHinweis', state.mailHinweis);
    if (String(methode).toUpperCase() !== 'GET') { zeichne(); return; }
    // Welche Kennung des Angebots (Angebots-ID, Ansprechpartner-ID …) steckt in der Adresse dieser Abfrage?
    // (Angebots-ID, Ansprechpartner-ID, Firmen-ID aus dem Firmenprofil …)
    let gelernt = null;
    mailSpur.details = lade('mailSpur', mailSpur.details);
    for (const x of mailSpur.details) {
      if (pfad.indexOf(x.id) !== -1) { gelernt = { vorlage: pfad.split(x.id).join('{id}'), feld: '#angebot', d: x.d }; break; }
      const treffer = skalare(x.d, '', [], 0).concat(x.z ? skalare(x.z, 'zeile', [], 0) : [])
        .filter((v) => pfad.indexOf(v.wert) !== -1 && !/^\d{4}-\d\d-\d\d/.test(v.wert))
        .sort((a, b) => b.wert.length - a.wert.length)[0];
      if (treffer) { gelernt = { vorlage: pfad.split(treffer.wert).join('{wert}'), feld: treffer.pfad, d: x.d }; break; }
    }
    if (!gelernt) for (const id of state.letzteZeilen.keys()) if (pfad.indexOf(id) !== -1) { gelernt = { vorlage: pfad.split(id).join('{id}'), feld: '#angebot', d: null }; break; }
    // Kennung in der Adresse (z. B. …/persons/<UUID>) in einer kurz vorher geladenen Angebotsantwort suchen
    if (!gelernt) {
      const tokens = pfad.split(/[/?&=#]/).filter((x) => x.length >= 8);
      for (const tok of tokens) {
        for (const r of (mailSpur.letzte || []).slice(1)) {
          const b = r.j.invocationResult || r.j;
          if (!istAngebot(b)) continue;
          const hit = skalare(b, '', [], 0).find((v) => v.wert === tok);
          if (hit) { gelernt = { vorlage: pfad.split(tok).join('{wert}'), feld: hit.pfad, d: b }; break; }
        }
        if (gelernt) break;
        // sonst: eine Personen-Kennung (UUID) → beim Abruf die Kennung des Ansprechpartners aus dem Angebot nehmen
        if (UUID_RE.test(tok) && /person|contact|kontakt|user/i.test(pfad)) { gelernt = { vorlage: pfad.split(tok).join('{wert}'), feld: '#kontaktUuid', d: null }; break; }
      }
    }
    if (gelernt) {
      // Güte 2: Antwort enthält genau den Ansprechpartner des Angebots (z. B. Nutzerliste im Firmenprofil), Güte 1: nur eine Firmen-Adresse
      const k = kontaktAus(j, gelernt.d);
      const guete = (k && k.person) || gelernt.feld === '#kontaktUuid' || (gelernt.d && /person|contact/i.test(gelernt.feld)) ? 2 : 1;
      delete gelernt.d;
      mailQuelle = lade('mailQuelle', mailQuelle);
      if (!mailQuelle || guete >= (mailQuelle.guete || 1)) {
        const neu = !mailQuelle || mailQuelle.vorlage !== gelernt.vorlage || mailQuelle.feld !== gelernt.feld || mailQuelle.guete !== guete;
        mailQuelle = Object.assign(gelernt, { guete: guete, t: Date.now() });
        speichere('mailQuelle', mailQuelle);
        if (neu) setzeStatus(guete === 2 ? '✉ Gelernt: Ab jetzt holt der Wächter die E-Mail des Ansprechpartners selbst'
          : '✉ Gelernt: Firmen-E-Mail. Noch besser: im Firmenprofil die Nutzer öffnen');
      }
    }
    zeichne();
  }
  // Aus einer Antwort mit E-Mail-Adressen (z. B. Nutzerliste im Firmenprofil) den Ansprechpartner des Angebots heraussuchen.
  // Gibt { mail, tel, person } zurück – person = true, wenn es genau der Nutzer ist, der die Fracht eingestellt hat.
  function kontaktAus(j, d) {
    const kandidaten = [];
    (function lauf(x, tiefe) {
      if (!x || typeof x !== 'object' || tiefe > 8) return;
      if (Array.isArray(x)) { x.forEach((v) => lauf(v, tiefe + 1)); return; }
      const mail = Object.keys(x).map((k) => x[k]).find((v) => fremdeMail(v));
      if (mail) kandidaten.push({ o: x, mail: mail.trim(), tiefe: tiefe });
      Object.keys(x).forEach((k) => { if (x[k] && typeof x[k] === 'object') lauf(x[k], tiefe + 1); });
    })(j, 0);
    if (!kandidaten.length) return null;
    const cp = (d && d.contactPerson) || {};
    const teile = normal(String(cp.name || '')).split(/[\s,.()-]+/).filter((w) => w.length >= 2);
    const ids = Object.keys(cp).filter((k) => /id$/i.test(k) && cp[k] != null).map((k) => String(cp[k]));
    // eigene Werte des Eintrags (und seiner Unterobjekte, aber keine Listen – sonst passt die ganze Firma)
    const werte = (o) => {
      const aus = [];
      Object.keys(o).forEach((k) => {
        const v = o[k];
        if (typeof v === 'string' || typeof v === 'number') aus.push(String(v));
        else if (v && typeof v === 'object' && !Array.isArray(v)) Object.keys(v).forEach((k2) => { if (typeof v[k2] === 'string' || typeof v[k2] === 'number') aus.push(String(v[k2])); });
      });
      return aus;
    };
    let beste = null;
    for (const k of kandidaten) {
      const w = werte(k.o), text = normal(w.join(' '));
      let punkte = 0;
      if (ids.some((id) => w.indexOf(id) !== -1)) punkte = 3;
      else if (teile.length && teile.every((t) => text.indexOf(t) !== -1)) punkte = 2;
      else if (teile.length && text.indexOf(teile[teile.length - 1]) !== -1) punkte = 1;
      if (punkte && (!beste || punkte > beste.punkte)) beste = Object.assign({ punkte: punkte }, k);
    }
    const tel = (o) => { const v = sucheWert(o, (k, x) => typeof x === 'string' && /phone|tel|mobil|fon/i.test(k) && x.replace(/\D/g, '').length >= 6); return v ? String(v).trim() : null; };
    if (beste) return { mail: beste.mail, tel: tel(beste.o), person: true };
    const firma = kandidaten.sort((a, b) => a.tiefe - b.tiefe)[0]; // sonst die allgemeine Firmen-Adresse
    return { mail: firma.mail, tel: null, person: false };
  }
  // E-Mail (und ggf. Telefon) für ein Angebot über die gelernte Abfrage holen – eine eigene Abfrage, zählt zum Stundenlimit
  async function holeMail(n) {
    mailQuelle = lade('mailQuelle', mailQuelle);
    if (!mailQuelle || !n.d) return null;
    const f = mailQuelle.feld;
    const wert = f === '#angebot' ? n.o.publicOfferId : f === '#kontaktUuid' ? kontaktUuid(n.d)
      : (f.indexOf('zeile.') === 0 ? holeFeld(n.o, f.slice(6)) : holeFeld(n.d, f));
    if (wert == null || wert === '') return null;
    const pfad = mailQuelle.vorlage.split('{id}').join(encodeURIComponent(n.o.publicOfferId)).split('{wert}').join(encodeURIComponent(String(wert)));
    if (mailQuelle.art === 'html') return kontaktAusText(await api('GET', pfad, undefined, true, true), n.d);
    const j = await api('GET', pfad, undefined, true);
    const k = kontaktAus(j, n.d);
    if (k && (f === '#kontaktUuid' || /person|contact/i.test(f))) k.person = true; // Abfrage für genau diese Person
    return k;
  }
  // Firmenprofil als Seite (HTML oder eingebettete Daten): den Ansprechpartner über seinen Namen finden –
  // die nächste E-Mail nach dem Namen gehört zu ihm, Telefon dazwischen ebenso.
  function kontaktAusText(html, d) {
    const t = normal(String(html || '').replace(/&auml;|\\u00e4/gi, 'ä').replace(/&ouml;|\\u00f6/gi, 'ö').replace(/&uuml;|\\u00fc/gi, 'ü')
      .replace(/&szlig;|\\u00df/gi, 'ß').replace(/&#64;|\\u0040/g, '@').replace(/&#46;/g, '.'));
    const re = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g;
    const mails = [];
    let m;
    while ((m = re.exec(t))) if (fremdeMail(m[0])) mails.push({ p: m.index, mail: m[0] });
    if (!mails.length) return null;
    const cp = (d && d.contactPerson) || {};
    const teile = normal(String(cp.name || '')).replace(/\b(herr|frau)\b/g, '').split(/[\s,.()-]+/).filter((w) => w.length >= 2);
    if (teile.length) {
      const nach = teile[teile.length - 1], vor = teile.length > 1 ? teile[0] : null;
      let beste = null, q = -1;
      while ((q = t.indexOf(nach, q + 1)) !== -1) {
        if (vor && t.slice(Math.max(0, q - 80), q + 80).indexOf(vor) === -1) continue;
        const e = mails.find((x) => x.p > q && x.p - q < 1500);
        if (e && (!beste || e.p - q < beste.abstand)) beste = { mail: e.mail, abstand: e.p - q, von: q, bis: e.p };
      }
      if (beste) {
        const stueck = t.slice(beste.von, beste.bis).replace(/<[^>]*>/g, ' ');
        const tel = (stueck.match(/\+?\d[\d \/()-]{6,}\d/g) || []).find((x) => x.replace(/\D/g, '').length >= 7);
        return { mail: beste.mail, tel: tel ? tel.trim() : null, person: true };
      }
    }
    return { mail: mails[0].mail, tel: null, person: false };
  }
  // Im Firmenprofil (eigener Tab): lernen, wie man von einem Angebot zum Profil kommt und ob die Teamliste auf der Seite steht
  async function profilLernen() {
    const pid = new URLSearchParams(location.search).get('id');
    if (!pid) return;
    const hinweis = (h) => { speichere('mailHinweis', h); };
    const spur = lade('mailSpur', []);
    let gefunden = null;
    for (const x of spur) {
      const werte = skalare(x.d, '', [], 0).concat(x.z ? skalare(x.z, 'zeile', [], 0) : []);
      const genau = werte.find((v) => v.wert === pid);
      const teil = genau ? null : werte.filter((v) => v.wert.length >= 5 && pid.indexOf(v.wert) !== -1).sort((a, b) => b.wert.length - a.wert.length)[0];
      if (genau || teil) { gefunden = { feld: (genau || teil).pfad, wert: (genau || teil).wert, d: x.d }; break; }
    }
    if (!gefunden) { hinweis('Firmenprofil gesehen, aber nicht vom zuletzt geöffneten Angebot aus – bitte aus einem Angebot heraus öffnen'); return; }
    const alt = lade('mailQuelle', null);
    if (alt && alt.guete === 2 && alt.art !== 'html') return; // besserer Weg (Daten-Abfrage) schon gelernt
    let html = '';
    try { const r = await meinFetch(location.href, { credentials: 'include', headers: { 'Accept': 'text/html' } }); html = await r.text(); } catch (e) { /* egal */ }
    const k = kontaktAusText(html, gefunden.d);
    if (!k) { hinweis('Firmenprofil gesehen: die E-Mails werden nachgeladen – bitte im Profil kurz warten bzw. „Das Team“ öffnen'); return; }
    const vorlage = location.pathname + '?' + location.search.slice(1).split(pid).join(pid.split(gefunden.wert).join('{wert}'));
    const guete = k.person ? 2 : 1;
    if (!alt || guete >= (alt.guete || 1)) {
      speichere('mailQuelle', { art: 'html', vorlage: vorlage, feld: gefunden.feld, guete: guete, t: Date.now() });
      hinweis('');
    }
  }
  // E-Mail des Ansprechpartners über das Timocom-Firmenprofil (so wie von Hand):
  // Angebot (customer.profileUrl) → Profil (publicCompanyId, Firmen-E-Mail) → Team, gesucht nach dem Namen des Ansprechpartners
  const profilCache = {}; // Profil-ID -> { uuid, mail, t }
  const PROFIL_API = '/app/tcprofile/rest/react-profiles-view/';
  async function profilKontakt(n) {
    const d = n.d || {}, cu = d.customer || {}, cp = d.contactPerson || {};
    if (abfragenLetzteStunde() >= maxAbfragen() - 20) return null; // die letzten Abfragen sind für Telefonnummern da
    const m = String(cu.profileUrl || '').match(/[?&]id=([^&#]+)/);
    if (!m) return null;
    const pid = decodeURIComponent(m[1]);
    let prof = profilCache[pid];
    if (!prof || Date.now() - prof.t > 24 * STD) {
      const j = await api('GET', PROFIL_API + 'profile-view/' + encodeURIComponent(pid), undefined, true);
      prof = { uuid: (j && j.publicCompanyId) || null, mail: j && fremdeMail(j.email) ? String(j.email).trim() : null, t: Date.now() };
      profilCache[pid] = prof;
    }
    const name = String(cp.name || '').replace(/^\s*(herr|frau)\s+/i, '').trim();
    if (prof.uuid && name) {
      const nn = normal(name);
      const teile = nn.split(/\s+/).filter(Boolean);
      const finde = (liste) => liste.find((x) => normal((x.firstName || '') + ' ' + (x.lastName || '')).trim() === nn) ||
        liste.find((x) => x.lastName && teile.indexOf(normal(x.lastName)) !== -1 && (!x.firstName || teile.indexOf(normal(x.firstName)) !== -1)) ||
        liste.find((x) => x.lastName && nn.indexOf(normal(x.lastName)) !== -1);
      const team = async (query, anzahl) => {
        const j = await api('GET', PROFIL_API + 'contactpersons/persons/' + encodeURIComponent(prof.uuid) + '?offset=0&count=' + anzahl + '&query=' + encodeURIComponent(query), undefined, true);
        return (j && j.contactPersons) || [];
      };
      const nachname = name.split(/\s+/).pop();
      let p = finde(await team(nachname, 20));
      if (!p) p = finde(await team('', 100)); // falls die Suche nichts findet: ganzes Team
      if (p && fremdeMail(p.businessEmail)) return { mail: String(p.businessEmail).trim(), tel: p.businessPhone || p.mobilePhone || null, person: true };
    }
    return prof.mail ? { mail: prof.mail, tel: null, person: false } : null;
  }
  async function mailDazu(n) {
    if (n.d) speichere('mailDiagEigen', { d: skelett(n.d), z: skelett(n.o) });
    if (!n.d) return;
    const cp = n.d.contactPerson || {};
    const hatTel = !!(cp.phone || cp.mobilePhone);
    if (emailVon(n.d) && hatTel) return;
    try {
      const k = (await profilKontakt(n).catch(() => null)) || (lade('mailQuelle', null) ? await holeMail(n) : null);
      state.mailVersuche = (state.mailVersuche || 0) + 1;
      if (k && !emailVon(n.d)) state.mailGefunden = (state.mailGefunden || 0) + 1;
      if (!k) return;
      if (!emailVon(n.d)) n.mail = k.mail;
      if (!hatTel && k.tel && k.person) n.d.contactPerson = Object.assign({}, cp, { phone: k.tel }); // Telefon aus dem Firmenprofil
    } catch (e) { /* dann ohne */ }
  }

  // Feiertage mit Lkw-Fahrverbot (bundesweit + NRW: Fronleichnam, Allerheiligen) – wie sonntags bis 22 Uhr
  const feiertagListe = {};
  function feiertag(d) {
    const y = d.getFullYear();
    if (!feiertagListe[y]) {
      const a = y % 19, b = Math.floor(y / 100), c = y % 100, e = b % 4;
      const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
      const h = (19 * a + b - Math.floor(b / 4) - g + 15) % 30;
      const l = (32 + 2 * e + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
      const m = Math.floor((a + 11 * h + 22 * l) / 451);
      const ostern = new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
      const rel = (n) => { const x = new Date(ostern); x.setDate(x.getDate() + n); return isoTag(x); };
      feiertagListe[y] = new Set([y + '-01-01', rel(-2), rel(1), y + '-05-01', rel(39), rel(50), rel(60),
        y + '-10-03', y + '-11-01', y + '-12-25', y + '-12-26']);
    }
    return feiertagListe[y].has(isoTag(d));
  }

  // Beste konkrete Folgeladung am Zielort – aus dem Rückladungs-Check, also ohne zusätzliche Abfrage
  function besteAnschluss(n) {
    const r = n.rueck;
    if (!r || !Array.isArray(r.zeilen) || !n.b || !n.b.ende) return null;
    const pl = n.o.loadingplaces || [];
    const ziel = koord(pl[pl.length - 1]);
    if (!ziel) return null;
    let beste = null;
    for (const z of r.zeilen) {
      if (!z || z.deleted || z.publicOfferId === n.o.publicOfferId || ausschluss(z)) continue;
      let b2;
      try { b2 = bewerte(z, ziel, n.b.ende); } catch (e) { continue; }
      if (!b2.machbar || b2.knapp || b2.deckung === null || zuWenigProKm(b2)) continue;
      if (b2.ankunftLaden - n.b.ende > 20 * STD) continue; // nicht ewig auf die Folgeladung warten
      if (!beste || b2.deckung > beste.b.deckung) beste = { o: z, b: b2 };
    }
    return beste;
  }
  // Gute Folgeladung gefunden → eine „schlechte“ Rückladungs-Gegend ist kein Grund mehr zum Aussortieren
  const rueckGerettet = (n) => !!(n.anschluss && n.anschluss.b.deckung >= einst.minDeckung);
  const rueckFuerFarbe = (n) => (rueckGerettet(n) || (n.b && n.b.deckungOhneHeim != null) ? null : n.rueck);
  // Lautstärke: Farbe, passt zum Auflieger (+1), Stammkunde mindestens laut
  // Fracht-App offen? Sie meldet sich jede Minute im Kanal „…-app“. Dann ntfy leise (Stufe 2 = ohne Ton), die App piept selbst.
  async function appStatus() {
    if (!origFetch || CONFIG.TESTMODUS) return;
    try {
      const r = await meinFetch(CONFIG.NTFY_SERVER + '/' + encodeURIComponent(CONFIG.NTFY_KANAL + '-app') + '/json?poll=1&since=5m', { headers: ntfyHeaders() });
      if (!r.ok) return;
      let letzte = 0, text = '';
      (await r.text()).split('\n').forEach((z) => { try { const m = JSON.parse(z); if (m.event === 'message' && m.time >= letzte) { letzte = m.time; text = String(m.message || ''); } } catch (e) { /* egal */ } });
      // „zu“ = App wurde geschlossen, Ton aus oder Ton gesperrt → ntfy klingelt sofort wieder normal
      state.appOffenBis = letzte && text !== 'zu' ? letzte * 1000 + 130 * 1000 : 0;
      state.appStatusT = Date.now();
    } catch (e) { /* dann normal klingeln */ }
  }
  const appIstOffen = () => einst.stummWennAppOffen !== false && Date.now() < (state.appOffenBis || 0);
  // ☀️ Heute La-Lie: heute laden und bis morgen 05:00 abgeladen – dieselbe Regel wie in der Fracht-App
  // La-Lie an einem Tag (0 = heute, 1 = morgen): an dem Tag laden und bis 5 Uhr am Morgen danach abgeladen
  function laLieAm(b, plus) {
    if (!b || !b.ankunftLaden || !b.ende || b.zeitUnklar) return false; // ohne feste Uhrzeiten keine La-Lie
    const tag0 = new Date(); tag0.setHours(0, 0, 0, 0); tag0.setDate(tag0.getDate() + plus);
    const naechster0 = new Date(tag0); naechster0.setDate(naechster0.getDate() + 1);
    return b.ankunftLaden >= tag0.getTime() && b.ankunftLaden < naechster0.getTime() && b.ende <= naechster0.getTime() + 5 * 36e5;
  }
  const istLaLie = (b) => laLieAm(b, 0);
  const istMorgenLaLie = (b) => laLieAm(b, 1);
  // Ton nur noch bei La-Lie-Touren – alles andere kommt still (Stufe 2: steht in ntfy, aber ohne Ton und Vibration):
  //   ☀️ Heute La-Lie → Stufe 5 (in ntfy: LKW-Signal) · 🌅 Morgen La-Lie → Stufe 4 (Hinweiston) · Rest → Stufe 2
  function prioVon(n, fa) {
    if (appIstOffen()) return 2;
    if (n && n.knapp) return 2; // 🤏 knapp: still – erst nachverhandeln
    if (n && n.neuEingestellt) return 2; // ♻️ schon einmal gemeldet, nur neu eingestellt: still
    if (n && n.still) return 2; // nur neu bewertet (z. B. andere Farbe): still
    try {
      // 🥇 Gold hupt immer (LKW-Hupe), egal für welchen Tag – Wunsch vom 27.11.
      if (fa && fa === FARBEN.gold) return 5;
      if (istLaLie(n.b)) return n.b.deckung === null ? 4 : 5; // ☀️ heute La-Lie: LKW-Hupe nur mit Preis – 🔵 ohne Preis nur Hinweiston (Wunsch vom 27.11.)
      if (istMorgenLaLie(n.b)) return 4;
      if (fa && fa === FARBEN.gruen) return 4; // 🟢 klingelt immer (Hinweiston) – Wunsch vom 26.11.
    } catch (e) { /* dann still */ }
    return 2;
  }
  // Preisvorschlag bei Angeboten ohne Preis: so viel, dass es 🟢 wäre, auf 10 € aufgerundet
  const vorschlag = (b) => Math.ceil(Math.max(b.mindestpreis, b.kosten * einst.gruenAb / 100) / 10) * 10;

  function anschlussText(n) {
    const an = n.anschluss, b = n.b;
    if (!an) return '';
    const apl = an.o.loadingplaces || [];
    const aStart = apl.find((p) => p.loadingType === 'LOADING') || apl[0];
    const ende = koord(apl[apl.length - 1]);
    // Drei kurze Zeilen: welche Ladung · wie weit leer hin und beladen · was danach bis nach Hause bleibt
    return 'Danach: ' + stadt(aStart) + ' → ' + stadt(apl[apl.length - 1]) + ' · ' + euro(an.b.preis) + ' (' + Math.round(an.b.deckung) + ' %)\n' +
      '   🛣 leer ' + zahl(an.b.leerKm, 0) + ' km bis zur Ladestelle + ' + zahl(an.b.lastKm, 0) + ' km beladen · laden ' + wann(an.b.ankunftLaden) +
      (ende || b.preis ? '\n   ' : '') +
      (ende ? '🏠 danach noch ' + zahl(kmLuft(ende, heimPos()) * einst.umwegFaktor, 0) + ' km bis ' + heimName() : '') +
      (b.preis ? (ende ? ' · ' : '') + 'zusammen ' + euro(b.preis + an.b.preis) + ' (' + Math.round((b.preis + an.b.preis) / (b.kosten + an.b.kosten) * 100) + ' %)' : '');
  }

  // Fertige Anfrage-E-Mail (öffnet die Mail-App, du drückst nur noch Senden)
  function mailLink(n, an) {
    const o = n.o, b = n.b, d = n.d || {};
    const pl = o.loadingplaces || [];
    const laden = pl.filter((p) => p.loadingType === 'LOADING');
    const entladen = pl.filter((p) => p.loadingType !== 'LOADING');
    const start = laden[0] || pl[0], ziel = pl[pl.length - 1];
    const cpm = d.contactPerson || {};
    const name = String(cpm.name || '').replace(/^\s*(herr|frau)\s+/i, '').trim();
    const nachname = name.split(/\s+/).pop();
    const anrede = name ? (cpm.female === true ? 'Guten Tag Frau ' + nachname : cpm.female === false ? 'Guten Tag Herr ' + nachname : 'Guten Tag ' + name) : 'Guten Tag';
    const mk = merkmale(o, n.d);
    const fd = d.freightDescription || {};
    const ware = fd.typeOfGoods && String(fd.typeOfGoods).trim();
    const betreff = 'Anfrage Ladung ' + stadt(start) + ' → ' + stadt(ziel) + (start && start.earliestLoadingDate ? ', ' + zeit(start.earliestLoadingDate) : '') + ' – noch verfügbar?';
    const fahrzeug = ['Sattelzug 40 t', 'Plane', 'Code XL']
      .concat(mk.indexOf('Getränke') !== -1 ? ['Getränkezertifikat'] : [], mk.indexOf('Zoll') !== -1 ? ['Zollschnur'] : []).join(', ');
    // Kurz gehalten: Der E-Mail-Knopf reist mit der Meldung, und Meldungen über Google dürfen nur ca. 4 KB groß sein
    const text = (signatur) => [
      anrede + ',',
      '',
      'ist Ihre Ladung bei Timocom noch verfügbar?', // kein Preis in der Mail – den verhandelst du selbst
      stadt(start) + ' → ' + stadt(ziel) + (start && start.earliestLoadingDate ? ', Laden ' + zeit(start.earliestLoadingDate).trim() : '') +
        ' · ' + zahl(o.freightLengthInMeters || 0, 1) + ' m · ' + zahl(o.freightWeightInTons || 0, 1) + ' t',
      '',
      'Fahrzeug: ' + fahrzeug + '.',
      '',
      'Über eine kurze Rückmeldung freuen wir uns' + (String(einst.mailTelefon || '').trim() ? ', gerne auch telefonisch unter ' + String(einst.mailTelefon).trim() : '') + '.',
      '',
      signatur,
    ].join('\n').replace(/\s+$/, '') + '\n\n';
    const sig = String(einst.mailSignatur || '').replace(/\\n/g, '\n').trim();
    const link = (t) => 'mailto:' + an + '?subject=' + encodeURIComponent(betreff) + '&body=' + encodeURIComponent(t);
    let url = link(text(sig));
    if (url.length > 5000) url = link(text(sig.split(/\n\s*\n/).slice(0, 3).join('\n\n'))); // ntfy-Grenze: ohne Hinweistext
    return url;
  }

  // ------------------------- Farben -------------------------
  // Tagestour, die auch mit der Leerfahrt zurück zum Standort alles deckt (Anfahrt, Tour, Heimfahrt, Fahrertag)
  const heimGedeckt = (b) => !!(b && b.tagestour && b.deckungHeim != null && b.deckungHeim >= einst.tagestourGruenAb);
  // Fährt danach ohnehin leer heim → Rückladungs-Check unnötig (🔁, gedeckte Tagestour, ☀️ ohne Preis)
  // Ziel liegt schon nahe der Heimat (Duisburg) → danach leer heim, Rückladung egal
  const zielNahHeim = (b) => !!b && b.zielHeimKm != null && b.zielHeimKm <= (einst.heimRadius || 0);
  const heimFahrt = (b) => !!b && (b.kategorie === 'rund' || ((b.heimEingerechnet || heimGedeckt(b)) && !b.einfach) || zielNahHeim(b) || (b.kategorie === 'heute' && b.deckung === null));
  function farbeVon(b, rueck) {
    if (!b || !b.machbar) return 'orange';
    if (b.deckung === null) return 'anfrage'; // ohne Preis: 🔵 Preis abklären
    if (b.deckung >= einst.goldAb) return rueck && rueck.bewertung === 'schlecht' ? 'gruen' : 'gold'; // schlechte Rückladung: eine Stufe runter
    if (heimGedeckt(b)) return 'gruen';
    let f = b.deckung >= einst.gruenAb ? 'gruen' : (b.deckung >= einst.gelbAb - (Number(einst.toleranz) || 0) ? 'gelb' : 'orange');
    if (f === 'gruen' && rueck && rueck.bewertung === 'schlecht') f = 'gelb';
    return f;
  }

  function kurzInfo(b) {
    if (!b.machbar) return 'Fracht-Wächter: ' + b.grund;
    const reiter = (KANAELE[b.kategorie] || KANAELE.sonst);
    const teil = b.deckung !== null
      ? 'Deckung ' + Math.round(b.deckung) + ' % · Kosten ' + euro(b.kosten)
      : 'Preis abklären · mindestens ' + euro(b.mindestpreis) + ' · Vorschlag ' + euro(vorschlag(b));
    return 'Fracht-Wächter: ' + teil + ' · Leer ' + zahl(b.leerKm, 0) + ' km' + (b.abOrt ? ' ab ' + b.abOrt : '') +
      (b.mitRueck ? ' + ' + zahl(b.rueckKm, 0) + ' km zurück' : '') + (b.tage >= 1.95 ? ' · ' + zahl(b.tage, 1) + ' Fahrertage' : '') + ' · ' + reiter.symbol + ' ' + reiter.name +
      (heimGedeckt(b) ? ' · 🏠 Tagestour inkl. Heimfahrt ' + Math.round(b.deckungHeim) + ' % gedeckt' : '') +
      (b.knapp ? ' · ⚠️ ' + knappText(b) : '');
  }

  // Zeilen der Timocom-Liste einfärben (Timocom zeichnet beim Scrollen neu – daher immer wieder anwenden)
  function faerbeTabelle() {
    document.querySelectorAll('[data-testid^="OfferTable/table/row"]').forEach((row) => {
      const tid = row.dataset.testid || '';
      if (tid.endsWith('_actionBar')) return;
      const id = tid.replace('OfferTable/table/row', '');
      const e = state.tabelle.get(id);
      const f = einst.tabelleFaerben && e ? e.farbe : null;
      const g = state.gruende[id];
      const merk = (f || '-') + '|' + id + '|' + (g ? g.t : 0);
      if (row.dataset.mzwFarbe === merk) return;
      row.dataset.mzwFarbe = merk;
      const fa = f ? FARBEN[f] : null;
      row.style.boxShadow = fa ? 'inset 6px 0 0 ' + fa.rand : '';
      row.style.opacity = f === 'aus' ? '0.4' : '';
      row.style.fontWeight = fa && fa.fett ? 'bold' : '';
      row.querySelectorAll('[role="cell"]').forEach((c) => { c.style.backgroundColor = fa ? fa.bg : ''; });
      row.title = (einst.tabelleFaerben && e ? e.info + '\n' : '') + 'Fracht-Wächter: ' + grundText(id);
    });
  }
  let faerbePlan = null;
  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    new MutationObserver(() => {
      if (faerbePlan || !state.tabelle.size) return;
      faerbePlan = setTimeout(() => { faerbePlan = null; faerbeTabelle(); }, 150);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // ------------------------- Rückladung am Zielort -------------------------
  // Heimat (Duisburg): Als Rückladung zählt nur, was zurück dorthin oder zumindest deutlich näher heran führt.
  function heimPos() {
    const z = String(einst.heimKoord || '').match(/-?\d+(?:[.,]\d+)?/g);
    const lat = z && z[0] ? parseFloat(z[0].replace(',', '.')) : NaN, lon = z && z[1] ? parseFloat(z[1].replace(',', '.')) : NaN;
    return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat: lat, lon: lon } : { lat: 51.4344, lon: 6.7623 };
  }
  const heimName = () => String(einst.heimName || '').trim() || 'Heimat';
  // Endet die Ladung nahe der Heimat – oder bringt sie dich mindestens halb so nah heran wie der Ort, an dem du stehst?
  function richtungHeim(z, abKm) {
    const pl = (z && z.loadingplaces) || [];
    const ende = koord(pl[pl.length - 1]);
    if (!ende) return false;
    const rest = kmLuft(ende, heimPos());
    return rest <= (einst.heimRadius || 0) || rest <= abKm * 0.5;
  }
  const isoTag = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function rueckSchluessel(o, b, anfrageObj) {
    const plaetze = o.loadingplaces || [];
    const ziel = plaetze[plaetze.length - 1];
    if (!ziel || !ziel.address || !ziel.address.coordinate) return null;
    const tag1 = new Date(b.ende); tag1.setHours(0, 0, 0, 0);
    const basis = (anfrageObj && anfrageObj.searchFilter) || {};
    const laender = [...new Set((basis.toZipFilter || []).map((z) => z.countryId).filter(Boolean))];
    if (!laender.length && basis.fromGeoFilter && basis.fromGeoFilter.countryId) laender.push(basis.fromGeoFilter.countryId);
    return { ziel: ziel, tag1: tag1, laender: laender,
      text: [ziel.address.countryId, (ziel.address.zipCode || '').slice(0, 3), isoTag(tag1), Math.floor(new Date(b.ende).getHours() / 4), laender.join(',')].join('|') };
  }
  function rueckAusCache(o, b, anfrageObj) {
    const s = rueckSchluessel(o, b, anfrageObj);
    const cache = s && state.rueckCache[s.text];
    return cache && Date.now() - cache.t < CONFIG.RUECK_CACHE_MINUTEN * MIN ? cache.wert : null;
  }

  async function rueckladung(o, b, anfrageObj) {
    const s = rueckSchluessel(o, b, anfrageObj);
    if (!s) return null;
    const ziel = s.ziel, laender = s.laender, schluessel = s.text;
    const tag1 = s.tag1;
    const tag2 = new Date(tag1); tag2.setDate(tag2.getDate() + 1);
    const iso = isoTag;
    const cache = rueckAusCache(o, b, anfrageObj);
    if (cache) return cache;

    const anfrage = JSON.parse(JSON.stringify(anfrageObj));
    const sf = anfrage.searchFilter = anfrage.searchFilter || {};
    sf.fromGeoFilter = {
      radius: einst.rueckRadius, city: ziel.address.city || '', zipCode: ziel.address.zipCode || '',
      coordinate: ziel.address.coordinate, countryId: ziel.address.countryId,
    };
    delete sf.fromZipFilter;
    delete sf.toGeoFilter;
    sf.toZipFilter = laender.map((c) => ({ countryId: c, zip1: '', zip2: '', zip3: '' }));
    sf.pickedDateFilter = [iso(tag1), iso(tag2)];
    sf.geoCorridor = false;
    sf.distanceFilter = {};
    sf.metaFilter = Object.assign({}, sf.metaFilter, {
      autoRefresh: false, deltaFilterActive: false, acousticNotification: false, visualNotification: false,
    });
    anfrage.searchAlongTheRouteActivated = false;
    anfrage.mapActivated = false;
    anfrage.autoCorrection = false;

    const j = await api('POST', API_SUCHE, anfrage);
    const alle = (j && j.invocationResult && j.invocationResult.filteredOfferRows) || [];
    // Nur Ladungen, die zurück Richtung Heimat (Duisburg) gehen: nahe der Heimat enden oder mindestens halb so nah heranbringen
    const abKm = kmLuft(koord(ziel), heimPos());
    const richtig = alle.filter((z) => z && !z.deleted && richtungHeim(z, abKm));
    // 📅 Nur Rückladungen zählen, die der LKW nach unserer Entladung spätestens am nächsten Tag laden kann und die nicht
    // übers Wochenende laufen: Mittwoch entladen → Donnerstag laden → Freitag abladen passt; Freitag entladen → erst Montag
    // abladen passt nicht (der LKW stünde übers Wochenende).
    const zielK = koord(ziel);
    const sonntagDazwischen = (von, bis) => { const d = new Date(von); d.setHours(0, 0, 0, 0); for (; d.getTime() <= bis; d.setDate(d.getDate() + 1)) if (d.getDay() === 0) return true; return false; };
    const zeilen = richtig.filter((z) => {
      if (ausschluss(z)) return false;
      try {
        const b2 = bewerte(z, zielK, b.ende);
        return b2.machbar && b2.ankunftLaden - b.ende <= 30 * STD && !sonntagDazwischen(b.ende, b2.ende);
      } catch (e) { return false; }
    });
    const wt = new Date(b.ende).getDay(), std = new Date(b.ende).getHours();
    const wochenende = (wt === 5 && std >= 10) || wt === 6 || wt === 0;
    const gross = zeilen.filter((z) => (z.freightLengthInMeters || 0) >= 7).length;
    const eurKm = zeilen
      .filter((z) => z.price && z.price.amount && waehrung(z.price.currencyId) === 'EUR' && (z.distanceInMeters || 0) >= 100000)
      .map((z) => z.price.amount / (z.distanceInMeters / 1000))
      .sort((x, y) => x - y);
    const median = eurKm.length ? eurKm[Math.floor(eurKm.length / 2)] : null;

    // Richtung Heimat gibt es naturgemäß weniger Angebote als in alle Richtungen – daher kleinere Grenzen
    let bewertung = 'mittel';
    if (gross < 3 || (median !== null && eurKm.length >= 3 && median < einst.kostenProKm * 1.15)) bewertung = 'schlecht';
    else if (gross >= 10 && median !== null && median >= einst.kostenProKm * 1.4) bewertung = 'gut';

    const wert = {
      ort: ziel.address.city || ziel.address.zipCode, anzahl: zeilen.length, alle: alle.length, voll: alle.length >= 500,
      gross: gross, median: median, mitPreis: eurKm.length, bewertung: bewertung,
      wochenende: wochenende, spaeter: richtig.length - zeilen.length, tag: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][wt],
      zeilen: zeilen.filter((z) => z && z.price && z.price.amount && waehrung(z.price.currencyId) === 'EUR'),
    };
    state.rueckCache[schluessel] = { t: Date.now(), wert: wert };
    return wert;
  }

  // ------------------- 🔙 Rückweg: nach einer angenommenen Tour Rückladungen ab dem Entladeort suchen -------------------
  // In der Fracht-App tippst du bei einer Tour auf „Angenommen – Rückweg suchen“. Die App schreibt das in den ntfy-Kanal …-auftrag.
  // Der Wächter liest das, bestätigt es und sucht dann alle paar Minuten selbst (eigene Abfrage, deine Suche bleibt wie sie ist)
  // Ladungen im Umkreis des Entladeorts für den Entladetag und den Tag danach, die Richtung Heimat gehen.
  // Bewertet wird ab dem Entladeort und ab dem Ende der Entladung. Treffer kommen als normale Meldung mit 🔙.
  const KANAL_AUFTRAG = CONFIG.NTFY_KANAL + '-auftrag';
  state.auftraege = lade('auftraege', {});
  let auftragGelesen = lade('auftragGelesen', []);
  let auftragHolenT = 0, rueckwegLaeuft = false;
  const aktivAuftrag = (a) => !!a && !a.aus && Date.now() < (a.ende || 0) + 36 * STD;
  function rueckSchluesselAktiv(k) { return /^rueck:/.test(String(k || '')) && aktivAuftrag(state.auftraege[String(k).slice(6)]); }
  function speichereAuftraege() {
    const jetzt = Date.now();
    for (const id of Object.keys(state.auftraege)) {
      const a = state.auftraege[id];
      if ((a.aus && jetzt - a.aus > 2 * 24 * STD) || jetzt > (a.ende || 0) + 4 * 24 * STD) { delete state.auftraege[id]; continue; }
      const g = Object.keys(a.gesehen || {});
      if (g.length > 600) g.slice(0, g.length - 600).forEach((k) => delete a.gesehen[k]);
    }
    speichere('auftraege', state.auftraege);
  }
  function auftragMelden(d) {
    if (!origFetch || CONFIG.TESTMODUS) return;
    try { zaehleNtfy(); } catch (e) { /* egal */ }
    meinFetch(CONFIG.NTFY_SERVER + '/' + encodeURIComponent(KANAL_AUFTRAG), { method: 'POST', headers: ntfyHeaders(), body: JSON.stringify(d) }).catch(() => { /* egal */ });
  }
  async function auftraegeHolen() {
    if (!origFetch || CONFIG.TESTMODUS || Date.now() - auftragHolenT < 2 * MIN) return;
    auftragHolenT = Date.now();
    try {
      const r = await meinFetch(CONFIG.NTFY_SERVER + '/' + encodeURIComponent(KANAL_AUFTRAG) + '/json?poll=1&since=24h', { headers: ntfyHeaders() });
      if (!r.ok) return;
      const ms = (await r.text()).split('\n').map((z) => { try { return JSON.parse(z); } catch (e) { return null; } })
        .filter((m) => m && m.event === 'message' && m.id).sort((x, y) => (x.time || 0) - (y.time || 0));
      auftraegeAnwenden(ms);
    } catch (e) { /* nächstes Mal */ }
  }
  function auftraegeAnwenden(ms) {
    const gelesen = new Set(auftragGelesen);
    let neu = false;
    for (const m of ms) {
      if (gelesen.has(m.id)) continue;
      gelesen.add(m.id); auftragGelesen.push(m.id); neu = true;
      let d = null; try { d = JSON.parse(m.message); } catch (e) { /* kein Auftrag */ }
      if (!d || typeof d.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(d.id)) continue;
      if (d.typ === 'an' && isFinite(Number(d.lat)) && isFinite(Number(d.lon)) && Math.abs(Number(d.lat)) <= 90 && Math.abs(Number(d.lon)) <= 180) {
        const ziel = { lat: Number(d.lat), lon: Number(d.lon) };
        const a = state.auftraege[d.id] = {
          id: d.id, tour: String(d.tour || '').slice(0, 80), ort: String(d.ort || '').slice(0, 40), plz: String(d.plz || '').replace(/\D/g, '').slice(0, 5),
          lat: ziel.lat, lon: ziel.lon, ende: Number(d.ende) > 0 ? Number(d.ende) : (m.time || 0) * 1000, seit: (m.time || 0) * 1000, gesehen: {}, gefunden: 0,
        };
        if (kmLuft(ziel, heimPos()) <= (Number(einst.heimRadius) || 0)) { a.aus = Date.now(); a.grundAus = 'Ziel nah an ' + heimName(); }
        auftragMelden({ typ: 'ok', id: d.id, t: Date.now(), aus: a.aus ? a.grundAus : undefined });
      } else if (d.typ === 'aus' && state.auftraege[d.id] && !state.auftraege[d.id].aus) {
        state.auftraege[d.id].aus = (m.time || 0) * 1000 || Date.now(); state.auftraege[d.id].grundAus = 'in der App beendet';
      }
    }
    if (neu) { auftragGelesen = auftragGelesen.slice(-300); speichere('auftragGelesen', auftragGelesen); speichereAuftraege(); zeichne(); }
  }
  async function rueckwegRunde() {
    if (CONFIG.TESTMODUS && !window.__mzwRueckTest) return;
    if (!binLeiter) return;
    await auftraegeHolen();
    const offen = Object.keys(state.auftraege).map((k) => state.auftraege[k]).filter(aktivAuftrag);
    if (!offen.length || rueckwegLaeuft || state.pruefungLaeuft) return;
    if (!imDienst() || !authToken || !state.letzteAnfrage) return;
    if (abfragenLetzteStunde() >= maxAbfragen() - 15) return; // Reserve für die normale Suche lassen
    const a = offen.filter((x) => Date.now() - (x.letzte || 0) >= 4 * MIN).sort((x, y) => (x.letzte || 0) - (y.letzte || 0))[0];
    if (!a) return;
    rueckwegLaeuft = true; a.letzte = Date.now();
    try { await rueckwegSuche(a); a.fehler = ''; } catch (e) { a.fehler = String(e.message || e); }
    finally { rueckwegLaeuft = false; speichereAuftraege(); zeichne(); }
  }
  function rueckwegAnfrage(a) {
    const anfrage = JSON.parse(JSON.stringify(state.letzteAnfrage));
    const sf = anfrage.searchFilter = anfrage.searchFilter || {};
    sf.fromGeoFilter = { radius: einst.rueckRadius, city: a.ort || '', zipCode: a.plz || '', coordinate: { latitude: a.lat, longitude: a.lon }, countryId: DE_ID };
    delete sf.fromZipFilter;
    delete sf.toGeoFilter;
    sf.toZipFilter = [{ countryId: DE_ID, zip1: '', zip2: '', zip3: '' }];
    const t1 = new Date(Math.max(a.ende || 0, Date.now())); t1.setHours(0, 0, 0, 0);
    const t2 = new Date(t1); t2.setDate(t2.getDate() + 1);
    sf.pickedDateFilter = [isoTag(t1), isoTag(t2)];
    sf.geoCorridor = false;
    sf.distanceFilter = {};
    sf.metaFilter = Object.assign({}, sf.metaFilter, { autoRefresh: false, deltaFilterActive: false, acousticNotification: false, visualNotification: false });
    anfrage.searchAlongTheRouteActivated = false;
    anfrage.mapActivated = false;
    anfrage.autoCorrection = false;
    return anfrage;
  }
  async function rueckwegSuche(a) {
    const suchKey = 'rueck:' + a.id;
    const anfrage = rueckwegAnfrage(a);
    const j = await api('POST', API_SUCHE, anfrage);
    const zeilen = (j && j.invocationResult && j.invocationResult.filteredOfferRows) || [];
    const jetzt = Date.now();
    state.suchen[suchKey] = jetzt;
    zeilen.forEach((o) => { if (o && o.publicOfferId && !o.deleted) state.gesehen[o.publicOfferId] = jetzt; });
    try { pruefeVeraltet(suchKey, zeilen, anfrage.searchFilter); } catch (e) { console.warn('[Fracht-Wächter]', e); }
    const abKm = kmLuft({ lat: a.lat, lon: a.lon }, heimPos());
    a.gesehen = a.gesehen || {};
    a.anzahl = zeilen.length;
    const neue = [];
    for (const o of zeilen) {
      if (!o || !o.publicOfferId || o.deleted) continue;
      const id = o.publicOfferId, preis = o.price ? o.price.amount : null, g = a.gesehen[id];
      if (g && g.f && g.p === preis) continue;
      if (!richtungHeim(o, abKm)) { a.gesehen[id] = { p: preis, f: 1 }; continue; }
      if (state.aktiv[id]) { a.gesehen[id] = { p: preis, f: 1 }; continue; } // schon gemeldet (z. B. von der normalen Suche)
      neue.push({ o: o, preisGeaendert: !!g && g.p !== preis, alterPreis: g ? g.p : null, rueckZu: a });
      if (neue.length >= 12) break;
    }
    a.richtung = zeilen.filter((o) => o && !o.deleted && richtungHeim(o, abKm)).length;
    speichere('gesehen', state.gesehen); speichere('suchen', state.suchen);
    if (!neue.length) return;
    const pos = { lat: a.lat, lon: a.lon, name: a.ort || 'Entladeort' };
    await pruefeUndMelde(neue, anfrage, pos, { start: a.ende, such: suchKey });
    for (const n of neue) {
      const id = n.o.publicOfferId, g = state.gruende[id];
      const fertig = !!g && !/^– wartet/.test(g.x);
      a.gesehen[id] = { p: n.o.price ? n.o.price.amount : null, f: fertig ? 1 : 0 };
      if (g && /^✓/.test(g.x)) a.gefunden = (a.gefunden || 0) + 1;
    }
  }

  // ------------------- Weggefallene Angebote aus der App löschen -------------------
  // Jede Meldung bekommt eine feste ID (sequence_id). Ist das Angebot bei Timocom weg, wird die Meldung
  // auf dem ntfy-Server gelöscht – Apps, die das unterstützen, entfernen sie dann auch auf dem Handy.
  const sequenzId = (o) => ('m' + String(o.publicOfferId)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  // Antippen der Meldung: direkt diese Tour in der Fracht-App (Handy) öffnen
  // Im Link stecken unsichtbar auch Ankunft an der Ladestelle und Ende der Entladung (Minuten) – damit die App z. B. „Heute La-Lie“ genau filtern kann
  // Alles aus der Timocom-Beschreibung für die Fracht-App – damit man Timocom nicht auf dem Handy öffnen muss
  // (Timocom erlaubt nur ein Gerät gleichzeitig: öffnet man es am Handy, wird der PC abgemeldet und der Wächter steht)
  function detailsFuerApp(n) {
    try {
      const d = (n && n.d) || {}, o = (n && n.o) || {}, fd = d.freightDescription || {};
      const teile = [];
      if (fd.typeOfGoods && String(fd.typeOfGoods).trim()) teile.push('Ware: ' + String(fd.typeOfGoods).trim());
      const zz = zahlungsziel(n.d);
      if (zz) teile.push('Zahlung: ' + zz + ' Tage');
      teile.push(o.loadingEquipmentExchange && o.loadingEquipmentExchange !== 'NO' ? 'Lademitteltausch: ja' : 'Lademitteltausch: nein');
      if (d.publicRemark && String(d.publicRemark).trim()) teile.push('Bemerkung: ' + String(d.publicRemark).trim().replace(/\s+/g, ' '));
      return teile.join('\n').slice(0, 450);
    } catch (e) { return ''; }
  }
  const appKlick = (sid, b, n) => {
    const u = String((einst && einst.appLink) || '').trim();
    if (!/^https:\/\//.test(u)) return {};
    const min = (ms) => (ms ? Math.round(ms / 60000) : 0);
    // Koordinaten für die Karte: .wA<lat>,<lon>~L<lat>,<lon>~E<lat>,<lon> (A = LKW-Standort, L = Laden, E = Entladen)
    const k4 = (k) => Number(k.lat).toFixed(4) + ',' + Number(k.lon).toFixed(4);
    const wege = b && b.punkte && b.punkte.length ? '.w' + [b.abKoord ? 'A' + k4(b.abKoord) : null].concat(b.punkte.map((x) => x.typ + k4(x.k) + (x.plz && x.plz.length >= 4 ? ',' + x.plz : ''))).filter(Boolean).join('~') : '';
    // Beschreibung ganz hinten: !i=<Text> (URL-kodiert)
    const info = n ? detailsFuerApp(n) : '';
    const rz = n && n.rueckZu && /^[A-Za-z0-9_-]+$/.test(n.rueckZu.id) ? '.r' + n.rueckZu.id : '';
    return { click: u + (sid ? '#tour-' + sid + (b && b.ankunftLaden && b.ende ? '.' + min(b.ankunftLaden) + '.' + min(b.ende) + rz + wege : rz) + (info ? '!i=' + encodeURIComponent(info) : '') : '') };
  };
  const ladeschluss = (o) => {
    const p = (o.loadingplaces || []).find((x) => x.loadingType === 'LOADING') || (o.loadingplaces || [])[0];
    if (!p) return null;
    const f = zeitfenster(p);
    const ende = f[f.length - 1].bis + (einst.pufferMin || 0) * MIN;
    return isFinite(ende) ? ende : null;
  };
  // ntfy.sh erlaubt ohne Konto ca. 250 Nachrichten am Tag – Löschen zählt mit. Meldungen haben Vorrang.
  function zaehleNtfy() {
    const grenze = Date.now() - 24 * STD;
    state.ntfy = (state.ntfy || lade('ntfy', [])).filter((t) => t > grenze);
    state.ntfy.push(Date.now());
    speichere('ntfy', state.ntfy);
  }
  // Echter Stand direkt von ntfy.sh (zählt pro Internetanschluss bzw. pro Konto, setzt einmal am Tag zurück)
  async function ntfyStandHolen() {
    if (!origFetch || CONFIG.TESTMODUS) return;
    try {
      const r = await meinFetch(CONFIG.NTFY_SERVER + '/v1/account', { headers: ntfyHeaders() });
      if (r.status === 401 && ntfyToken()) { tokenAbgelehnt(); return; }
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.limits && j.stats && typeof j.stats.messages === 'number') {
        state.ntfyServer = { genutzt: j.stats.messages, frei: j.stats.messages_remaining, grenze: j.limits.messages, reset: (j.stats.reset_at || 0) * 1000, t: Date.now(), lokal: ntfyHeuteLokal() };
        // direkt nach dem Zurücksetzen bei ntfy nochmal nachfragen, damit das Löschen sofort wieder läuft
        const bisReset = state.ntfyServer.reset - Date.now();
        if (bisReset > 0 && bisReset < 10 * MIN && !state.ntfyResetGeplant) {
          state.ntfyResetGeplant = true;
          setTimeout(() => { state.ntfyResetGeplant = false; ntfyStandHolen(); }, bisReset + 30 * 1000);
        }
      }
    } catch (e) { /* dann eigene Zählung */ }
  }
  const ntfyServerAktuell = () => state.ntfyServer && Date.now() - state.ntfyServer.t < 20 * MIN && (!state.ntfyServer.reset || Date.now() < state.ntfyServer.reset);
  // verbraucht heute: Stand von ntfy + was seitdem verschickt wurde; ohne Serverstand die eigene 24-Std.-Zählung
  const ntfyHeute = () => (ntfyServerAktuell() ? state.ntfyServer.genutzt + Math.max(0, ntfyHeuteLokal() - state.ntfyServer.lokal) : ntfyHeuteLokal());
  const ntfyHeuteLokal = () => {
    const grenze = Date.now() - 24 * STD;
    state.ntfy = (state.ntfy || lade('ntfy', [])).filter((t) => t > grenze);
    return state.ntfy.length;
  };

  // ------------------- 🔵 Preis abklären als Sammelmeldung -------------------
  function sammle(n) {
    const liste = lade('preisSammel', []);
    if (liste.some((x) => x.id === n.o.publicOfferId)) return;
    const pl = n.o.loadingplaces || [];
    const start = pl.find((p) => p.loadingType === 'LOADING') || pl[0];
    const ziel = pl[pl.length - 1];
    liste.push({
      id: n.o.publicOfferId, t: Date.now(), bis: ladeschluss(n.o), laden: n.b.ankunftLaden || 0, ldm: n.o.freightLengthInMeters || 0,
      strecke: artSymbol(n.b.kategorie) + stadt(start) + ' → ' + stadt(ziel), link: timocomLink(n.o),
      rest: fensterKurz(start) + ' · ' + zahl(n.b.lastKm, 0) + ' km · ' + zahl(n.o.freightLengthInMeters || 0, 1) + ' m · ' + zahl(n.o.freightWeightInTons || 0, 1) + ' t · Vorschlag ' + euro(vorschlag(n.b)),
      text: artSymbol(n.b.kategorie) + stadt(start) + ' → ' + stadt(ziel) + ' · ' + fensterKurz(start) + ' · ' +
        zahl(n.b.lastKm, 0) + ' km · ' + zahl(n.o.freightLengthInMeters || 0, 1) + ' m · ' + zahl(n.o.freightWeightInTons || 0, 1) + ' t · Vorschlag ' + euro(vorschlag(n.b)),
    });
    speichere('preisSammel', liste.slice(-60));
  }
  function sammelSenden(sofort) {
    if (!binLeiter) return;
    if (!imDienst()) return;
    const rest = !sammelAktiv(); // Token eingetragen: Gesammeltes noch einmal schicken, danach kommt 🔵 einzeln
    if (rest && !lade('preisSammel', []).length) return;
    if (!rest && !(Number(einst.preisSammelMin) > 0)) return;
    const letzte = lade('preisSammelZeit', 0);
    if (!sofort && !rest && Date.now() - letzte < Number(einst.preisSammelMin) * MIN) return;
    const jetzt = Date.now();
    const liste = lade('preisSammel', []).filter((x) => !x.bis || x.bis > jetzt); // Ladezeit schon vorbei → weglassen
    if (!liste.length) { speichere('preisSammel', []); return; }
    liste.sort((a, b) => (a.laden - b.laden) || (b.ldm - a.ldm));
    // Jede Strecke als Link: Antippen in der ntfy-App öffnet genau dieses Angebot in Timocom (Markdown-Liste)
    const md = (t) => String(t).replace(/([\\`*_[\]()#>|])/g, '\\$1');
    const zeile = (x) => x.link ? '- [' + md(x.strecke) + '](' + x.link + ') · ' + md(x.rest) : '- ' + md(x.text);
    const titel = '🔵 Preis abklären: ' + liste.length + (liste.length === 1 ? ' neue Tour' : ' neue Touren');
    const extra = { topic: KANAL_PREIS, markdown: true, ...appKlick(''),
      actions: [{ action: 'view', label: 'Timocom öffnen', url: 'https://my.timocom.com/app/tccargo/freights/search/', clear: false }] };
    let anzahl = Math.min(8, liste.length), text = '';
    for (; anzahl >= 1; anzahl--) {
      text = liste.slice(0, anzahl).map(zeile).join('\n') + (liste.length > anzahl ? '\n\n+' + (liste.length - anzahl) + ' weitere – in Timocom blau markiert' : '');
      if (fcmGroesse(Object.assign({ title: titel, message: text }, extra)) <= 3900) break;
    }
    sende(titel, text, 2, '', extra); // still – Ton gibt es nur bei La-Lie
    speichere('preisSammel', []);
    speichere('preisSammelZeit', jetzt);
    state.protokoll.unshift(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' 🔵 Sammelmeldung mit ' + liste.length + ' Touren gesendet');
    state.protokoll.length = Math.min(state.protokoll.length, 5);
  }

  function merke(n, topic, sid, such) {
    const id = n.o.publicOfferId;
    const e = state.aktiv[id] || { k: [], fehlt: 0 };
    if (!e.k.some((x) => x.topic === topic)) e.k.push({ topic: topic, sid: sid });
    e.such = such || e.such; e.t = Date.now(); e.bis = ladeschluss(n.o); e.text = strecke(n.o); e.fehlt = 0; e.fp = inhaltOhnePreis(n.o); e.sw = flach(n.o); e.dup = doppelSchluessel(n.o);
    state.aktiv[id] = e;
    try { ersetzeAlte(n); } catch (err) { /* egal */ }
    speichere('aktiv', state.aktiv);
  }

  // Zahlen und Datumswerte eines Angebots (z. B. distanceInMeters, price.amount, loadingplaces.0.earliestLoadingDate) –
  // damit lässt sich bei einer vollen Liste (500) feststellen, ob ein fehlendes Angebot eigentlich noch drin sein müsste
  function flach(o) {
    const aus = {};
    const geh = (x, pfad, tiefe) => {
      if (x == null || tiefe > 3) return;
      if (typeof x === 'number' && isFinite(x)) { aus[pfad] = x; return; }
      if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x)) { const t = Date.parse(x); if (isFinite(t)) aus[pfad] = t; return; }
      if (Array.isArray(x)) { if (x.length) geh(x[0], pfad + '.0', tiefe + 1); return; }
      if (typeof x === 'object') Object.keys(x).forEach((k) => { if (!/id$/i.test(k)) geh(x[k], pfad ? pfad + '.' + k : k, tiefe + 1); });
    };
    geh(o, '', 0);
    return aus;
  }
  // Timocom liefert höchstens 500 Angebote. Wonach ist die Liste sortiert? (Ein Wert, der über die ganze Liste
  // nur steigt oder nur fällt.) Dann ist klar: Was nach dieser Sortierung vor dem letzten Eintrag käme, müsste drin sein.
  function sortierungDerListe(zeilen) {
    const z = zeilen.filter((o) => o && o.publicOfferId && !o.deleted);
    if (z.length < 100) return null;
    const werte = z.map(flach);
    for (const pfad of Object.keys(werte[0])) {
      const w = werte.map((x) => x[pfad]);
      if (w.some((v) => typeof v !== 'number')) continue;
      let auf = true, ab = true;
      const verschieden = new Set(w);
      for (let i = 1; i < w.length; i++) { if (w[i] < w[i - 1]) auf = false; if (w[i] > w[i - 1]) ab = false; }
      if (auf === ab || verschieden.size < 20) continue;
      return { pfad: pfad, auf: auf, letzte: w[w.length - 1] };
    }
    return null;
  }
  const mussInListe = (e, g) => { const v = e && e.sw && e.sw[g.pfad]; return typeof v === 'number' && (g.auf ? v < g.letzte : v > g.letzte); };

  // Ladetag(e) der Suche aus dem Filter, z. B. „27.11.“ oder „26.–27.11.“ (für das Lebenszeichen)
  function tagDerSuche(filter) {
    try {
      const nah = (x) => Math.abs(new Date(x + 'T12:00:00').getTime() - Date.now()) < 30 * 24 * STD; // nur echte Ladetage, keine Altdaten
      const d = Array.from(new Set(JSON.stringify(filter || {}).match(/20\d\d-\d\d-\d\d/g) || [])).filter(nah).sort();
      if (!d.length) return '';
      const k = (x) => x.slice(8, 10) + '.' + x.slice(5, 7) + '.';
      return d.length === 1 || d[0] === d[d.length - 1] ? k(d[0]) : k(d[0]) + '–' + k(d[d.length - 1]);
    } catch (e) { return ''; }
  }
  function pruefeVeraltet(such, zeilen, filter) {
    const jetzt = Date.now();
    const da = new Set(zeilen.filter((o) => o && o.publicOfferId && !o.deleted).map((o) => o.publicOfferId));
    const geloescht = new Set(zeilen.filter((o) => o && o.publicOfferId && o.deleted).map((o) => o.publicOfferId));
    // Nur vergleichen, wenn die Liste vollständig aussieht: kein „Nur neue Angebote“, nicht plötzlich viel kürzer als vorher.
    // Volle Liste (500 – Timocom schneidet ab): nur die fehlenden Angebote, die nach der Sortierung noch drin sein müssten.
    const vorher = state.anzahl[such] || 0;
    state.anzahl[such] = zeilen.length;
    const meta = (filter && filter.metaFilter) || {};
    const voll = zeilen.length >= 500;
    const grenze = voll ? sortierungDerListe(zeilen) : null;
    if (!/^rueck:/.test(such)) state.listeVoll = voll ? { n: zeilen.length, sortiert: grenze ? grenze.pfad : '' } : null;
    if (!/^rueck:/.test(such)) state.listenInfo[such] = { n: zeilen.length, tag: tagDerSuche(filter), sort: grenze ? grenze.pfad.replace(/^.*\./, '') + (grenze.auf ? '↑' : '↓') : '', bis: grenze && typeof grenze.letzte === 'number' ? grenze.letzte : null };
    const vergleichbar = !meta.deltaFilterActive && (!voll || !!grenze) && (!vorher || zeilen.length >= vorher * 0.6);
    // Werte der gemeldeten Angebote auffrischen, solange sie in der Liste stehen (auch für ältere Meldungen ohne Werte)
    zeilen.forEach((o) => { if (o && o.publicOfferId && state.aktiv[o.publicOfferId] && !o.deleted) state.aktiv[o.publicOfferId].sw = flach(o); });
    let geaendert = false;
    // Touren einer Suche, die nicht mehr läuft (Tab zu, Filter geändert), werden NICHT mehr über eine andere Liste gelöscht –
    // die passt ja oft gar nicht (z. B. „morgen“-Touren in der „heute“-Liste). Sie werden einzeln bei Timocom nachgeprüft.
    const verlassen = () => false;
    for (const id of Object.keys(state.aktiv)) {
      const e = state.aktiv[id];
      if (vergleichbar && verlassen(e.such)) { e.such = such; e.fehlt = 0; geaendert = true; }
      // steht die Tour in DIESER Liste, gehört sie ab jetzt zu ihr (z. B. nach Umstellen auf getrennte Tabs heute/morgen) –
      // dann wird sie hier auch wieder abgeglichen und schnell gelöscht, wenn sie wegfällt
      if (da.has(id) && e.such !== such && !/^rueck:/.test(such) && !rueckSchluesselAktiv(e.such) && !(e.such && state.suchen[e.such] && jetzt - state.suchen[e.such] < 3 * MIN)) { e.such = such; e.fehlt = 0; geaendert = true; }
      let grund = null;
      // Ladezeit vorbei = Ende des Ladefensters (ohne den Spielraum für „knapp“) – dann sofort aus der App
      const schluss = e.bis ? e.bis - (einst.pufferMin || 0) * MIN : null;
      if (jetzt - e.t > 3 * 24 * STD) grund = 'älter als 3 Tage';
      else if (schluss && jetzt > schluss) grund = 'Ladezeit vorbei';
      else if (geloescht.has(id)) grund = 'bei Timocom gelöscht';
      else if (e.weg) grund = e.grundWeg || 'bei Timocom gelöscht';
      else if (e.such === such && vergleichbar) {
        if (da.has(id)) { if (e.fehlt) { e.fehlt = 0; geaendert = true; } }
        else if (!voll || mussInListe(e, grenze)) { e.fehlt = (e.fehlt || 0) + 1; geaendert = true; if (e.fehlt >= 2) grund = 'bei Timocom weg'; }
      }
      // Fällt die gemeldete Fassung weg, werden ihre Doppel wieder geprüft (sie stehen ja vielleicht noch drin)
      if (grund && e.doppelt) { e.doppelt.forEach((d) => { delete state.gruende[d]; nochmal[d] = jetzt; }); speichere('nochmal', nochmal); }
      if (grund && einst.veralteteLoeschen) { if (loesche(id, e, grund)) geaendert = true; else if (jetzt - e.t > 4 * 24 * STD) { delete state.aktiv[id]; geaendert = true; } }
      else if (grund) { delete state.aktiv[id]; geaendert = true; }
    }
    if (geaendert) speichere('aktiv', state.aktiv);
    setTimeout(() => { pruefeGeloeschte().catch(() => { /* egal */ }); }, 2000);
  }

  // Gemeldete Angebote, die in den letzten Listen fehlen, einzeln bei Timocom nachschlagen:
  // gelöscht oder nicht mehr da → sofort aus der App. Schonend: je Aktualisierung höchstens 2, je Stunde höchstens 40.
  let loeschPruefungLaeuft = false;
  const loeschChecks = [];
  // Abgleich mit ntfy: Meldungen, die noch in der App stehen, der Wächter aber nicht (mehr) kennt
  // (z. B. aus älteren Versionen oder nach einem Neustart), wieder in die Lösch-Überwachung aufnehmen
  function uebernimmAusNtfy(ev) {
    const weg = new Set(ev.filter((m) => m && m.event === 'message_delete').map((m) => m.topic + '|' + m.sequence_id));
    const bekannt = new Set();
    Object.keys(state.aktiv).forEach((id) => (state.aktiv[id].k || []).forEach((k) => bekannt.add(k.topic + '|' + k.sid)));
    const such = state.letzteAnfrage ? suchSchluessel(state.letzteAnfrage.searchFilter || {}) : 'ntfy';
    let neu = 0;
    for (const m of ev) {
      if (!m || m.event !== 'message' || !m.sequence_id) continue;
      const key = m.topic + '|' + m.sequence_id;
      if (weg.has(key) || bekannt.has(key)) continue;
      const url = (m.actions || []).map((a) => String(a.url || '')).find((u) => /\/freights\/search\/view\//.test(u));
      const id = url ? url.split('/view/')[1].split(/[?#/]/)[0] : null;
      if (!id) continue; // z. B. Sammelmeldungen ohne einzelnes Angebot
      const e = state.aktiv[id] || { k: [], such: such, t: (m.time || 0) * 1000, bis: null, text: String(m.title || '').replace(/^.*·\s*/, ''), fehlt: 0, ausNtfy: true };
      e.k = e.k || [];
      e.k.push({ topic: m.topic, sid: m.sequence_id });
      state.aktiv[id] = e; bekannt.add(key); neu++;
    }
    if (neu) { speichere('aktiv', state.aktiv); console.log('[Fracht-Wächter] ' + neu + ' Meldungen aus ntfy wieder in die Lösch-Überwachung genommen'); }
    return neu;
  }
  async function ntfyAbgleich() {
    if (!binLeiter) return;
    if (!origFetch || CONFIG.TESTMODUS) return;
    try {
      const kanaele = [CONFIG.NTFY_KANAL, KANAL_HEUTE, KANAL_PREIS].map(encodeURIComponent).join(',');
      const r = await meinFetch(CONFIG.NTFY_SERVER + '/' + kanaele + '/json?poll=1&since=all', { headers: ntfyHeaders() });
      if (!r.ok) return;
      const ev = (await r.text()).split('\n').map((z) => { try { return JSON.parse(z); } catch (e) { return null; } }).filter(Boolean);
      uebernimmAusNtfy(ev);
    } catch (e) { /* später nochmal */ }
  }

  async function pruefeGeloeschte() {
    if (loeschPruefungLaeuft || !einst.veralteteLoeschen || !authToken || CONFIG.TESTMODUS && !window.__mzwLoeschTest) return;
    const jetzt = Date.now();
    while (loeschChecks.length && loeschChecks[0] < jetzt - STD) loeschChecks.shift();
    // Bis 60 % des Stundenlimits bis zu 60 Prüfungen je Stunde – darüber trotzdem immer noch 30 (sonst bleiben Leichen in der App)
    if (loeschChecks.length >= 60 || (abfragenLetzteStunde() >= maxAbfragen() * 0.6 && loeschChecks.length >= 30) || abfragenLetzteStunde() >= maxAbfragen() - 5) return;
    const kandidaten = Object.keys(state.aktiv).filter((id) => {
      const e = state.aktiv[id];
      if (!e || e.weg) return false;
      const zuletzt = state.gesehen[id] || 0;
      if (jetzt - zuletzt < 150 * 1000) return false; // steht noch in der Liste
      const abstand = jetzt - zuletzt < STD ? 10 * MIN : 60 * MIN; // gerade verschwunden: öfter nachsehen
      return jetzt - (e.geprueft || 0) > abstand;
    // Reihum: noch nie geprüfte zuerst, dann die am längsten nicht geprüften – sonst kommen ältere Touren nie dran
    }).sort((a, b) => ((state.aktiv[a].geprueft || 0) - (state.aktiv[b].geprueft || 0)) || ((state.gesehen[b] || 0) - (state.gesehen[a] || 0))).slice(0, 2);
    if (!kandidaten.length) return;
    loeschPruefungLaeuft = true;
    try {
      for (const id of kandidaten) {
        const e = state.aktiv[id];
        if (!e) continue;
        loeschChecks.push(Date.now());
        let weg = false;
        try {
          const j = await api('GET', API_SUCHE + '/' + encodeURIComponent(id));
          const d = j && j.invocationResult;
          if (d && d.deleted === true) weg = true;
          else if (!d && /not.?found|nicht gefunden|deleted|gel[öo]scht/i.test(JSON.stringify(j || {}))) weg = true;
        } catch (err) {
          if (/ (404|410)\b/.test(String(err && err.message))) weg = true;
          else { e.geprueft = Date.now(); continue; } // Limit, abgemeldet usw. – später nochmal
        }
        e.geprueft = Date.now();
        if (weg) { e.weg = true; loesche(id, e, 'bei Timocom gelöscht'); }
      }
      speichere('aktiv', state.aktiv);
    } finally { loeschPruefungLaeuft = false; }
  }

  // Dieselbe Fracht neu eingestellt (meist mit anderem Preis): die alte Meldung aus der App nehmen
  function ersetzeAlte(n) {
    const fp = inhaltOhnePreis(n.o), neu = n.o.publicOfferId;
    for (const id of Object.keys(state.aktiv)) {
      const e = state.aktiv[id];
      if (id !== neu && e && e.fp === fp) { e.weg = true; loesche(id, e, 'neu eingestellt' + (n.preisGeaendert ? ' mit neuem Preis' : '')); }
    }
  }

  function loesche(id, e, grund) {
    if (ntfyHeute() + e.k.length > ntfyReserve()) return false; // Tageslimit schonen – später nochmal
    e.k.forEach((k) => {
      zaehleNtfy();
      const url = CONFIG.NTFY_SERVER + '/' + encodeURIComponent(k.topic) + '/' + encodeURIComponent(k.sid) + '/delete';
      if (CONFIG.TESTMODUS && !window.__mzwLoeschEcht) { (window.__mzwTestLog = window.__mzwTestLog || []).push({ loeschen: url, grund: grund }); return; }
      if (!origFetch) return;
      // Erst wenn ntfy das Löschen bestätigt, ist die Meldung aus der App weg – sonst später nochmal versuchen
      const versuch = (nochmal) => meinFetch(url, { headers: ntfyHeaders() }).then((r) => {
        if ((r.status === 401 || r.status === 403) && ntfyToken() && nochmal) { tokenAbgelehnt(); return versuch(false); }
        if (!r.ok) throw new Error('ntfy ' + r.status);
      });
      versuch(true).catch(() => {
        const alt = state.aktiv[id] || Object.assign({}, e, { k: [] });
        if ((alt.fehlversuche || 0) >= 20) return; // nach vielen Fehlversuchen aufgeben
        if (!alt.k.some((x) => x.topic === k.topic)) alt.k.push(k);
        alt.weg = true; alt.grundWeg = grund; alt.fehlversuche = (alt.fehlversuche || 0) + 1;
        state.aktiv[id] = alt;
        speichere('aktiv', state.aktiv);
      });
    });
    delete state.aktiv[id];
    state.entfernt++;
    state.protokoll.unshift(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) +
      ' 🗑 ' + (e.text || id) + ' – ' + grund + ', aus App entfernt');
    state.protokoll.length = Math.min(state.protokoll.length, 5);
    return true;
  }

  // ------------------------------ Hilfen ------------------------------
  function suchSchluessel(filter) {
    const f = Object.assign({}, filter);
    delete f.metaFilter; // Auto-Aktualisieren, Ton usw. ändern die Suche nicht
    return hash(JSON.stringify(f));
  }

  // Doppelt eingestellt? Gleiche Firma, gleiche Lade- und Entladestelle (PLZ), gleiche Ladung und gleicher Preis – Datum egal
  function doppelSchluessel(o) {
    const pl = o.loadingplaces || [];
    const ad = (p) => (p && p.address ? p.address.countryId + '-' + p.address.zipCode : '');
    return hash([o.globalCompanyId, ad(pl[0]), ad(pl[pl.length - 1]), pl.length, o.freightLengthInMeters, o.freightWeightInTons, o.price ? o.price.amount : ''].join('#'));
  }
  // Ist dieselbe Ladung schon gemeldet und steht die Meldung noch in der aktuellen Liste? (Sonst ist es eine Neueinstellung → normal melden)
  function doppeltGemeldet(o) {
    const k = doppelSchluessel(o);
    for (const id of Object.keys(state.aktiv)) {
      const e = state.aktiv[id];
      if (id !== o.publicOfferId && e && e.dup === k && !e.weg && state.letzteZeilen.has(id)) return e;
    }
    return null;
  }

  function inhaltOhnePreis(o) {
    const orte = (o.loadingplaces || []).map((p) => [
      p.loadingType, p.address && p.address.countryId, p.address && p.address.zipCode,
      p.earliestLoadingDate, p.earliestLoadingTime, p.latestLoadingDate, p.latestLoadingTime,
    ].join('|'));
    return hash([o.globalCompanyId].concat(orte, [o.freightLengthInMeters, o.freightWeightInTons]).join('#'));
  }

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function aufraeumen(jetzt) {
    for (const k in state.gesehen) if (jetzt - state.gesehen[k] > 3 * 24 * STD) delete state.gesehen[k];
    for (const k in state.inhalte) if (jetzt - state.inhalte[k].t > 24 * STD) delete state.inhalte[k];
    for (const k in state.suchen) if (jetzt - state.suchen[k] > 7 * 24 * STD) delete state.suchen[k];
    for (const k in state.rueckCache) if (jetzt - state.rueckCache[k].t > CONFIG.RUECK_CACHE_MINUTEN * MIN) delete state.rueckCache[k];
  }

  // ------------------------------ Meldungen ------------------------------
  const zahl = (n, st) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: st === undefined ? 2 : st });
  const euro = (n) => zahl(Math.round(n), 0) + ' €';
  const land = (id) => { const c = state.laender[id]; return c && c !== 'DE' ? c + ' ' : ''; };
  const waehrung = (id) => state.waehrungen[id] || '';
  const ort = (p) => p ? (land(p.address.countryId) + (p.address.zipCode || '') + ' ' + (p.address.city || '')).trim() : '?';
  const uhrzeit = (ms) => {
    const d = new Date(ms);
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '. ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  const zeit = (d, t) => d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + (t ? ' ' + t.slice(0, 5) : '') : '';
  const fenster = (p) => {
    if (!p) return '';
    const a = zeit(p.earliestLoadingDate, p.earliestLoadingTime);
    const b = zeit(p.latestLoadingDate, p.latestLoadingTime);
    if (!b || a === b) return a;
    if (p.earliestLoadingDate === p.latestLoadingDate && p.latestLoadingTime) {
      return a + '–' + p.latestLoadingTime.slice(0, 5);
    }
    return a + ' – ' + b;
  };
  function strecke(o) {
    const pl = o.loadingplaces || [];
    const start = pl.find((p) => p.loadingType === 'LOADING') || pl[0];
    const ziel = pl[pl.length - 1];
    return ort(start) + ' → ' + ort(ziel);
  }
  const telLink = (nr) => 'tel:' + String(nr).replace(/[^\d+]/g, '');

  function melde(passend, uebersprungen, such) {
    if (!passend.length && !uebersprungen) return;
    state.gemeldet += passend.length;
    const einzeln = passend.slice(0, CONFIG.MAX_MELDUNGEN_AUF_EINMAL);
    einzeln.forEach((n) => {
      const m = formatiere(n);
      const k = KANAELE[n.b.kategorie] || KANAELE.sonst;
      state.zaehler[n.b.kategorie] = (state.zaehler[n.b.kategorie] || 0) + 1;
      // 🏆 = bisher beste Deckung heute in diesem Reiter
      let pokal = '';
      if (n.b.deckung !== null) {
        const schluessel = new Date().toDateString() + '|' + n.b.kategorie;
        if (!state.bestes[schluessel] || n.b.deckung > state.bestes[schluessel]) {
          state.bestes[schluessel] = n.b.deckung;
          pokal = '🏆 ';
        }
      }
      // Farbpunkt vorne: 🥇 Gold · 🟢 sehr gut · 🟡 geht so · 🔴 lohnt nicht · 🔵 Preis abklären – 🥇/🟢 klingeln am lautesten
      const fa = n.knapp ? FARBEN.gelb : FARBEN[farbeVon(n.b, rueckFuerFarbe(n))];
      const sid = sequenzId(n.o);
      const versuche = (n.sendVersuche || 0) + 1;
      sende(m.mitFarbe ? m.titel : (fa ? fa.symbol : '❔') + ' ' + artSymbol(n.b.kategorie) + pokal + m.titel, m.text, prioVon(n, fa), (einst.kompakt || m.mitFarbe) ? '' : 'articulated_lorry',
        Object.assign({ topic: kanalFuer(n.b), sequence_id: sid }, appKlick(sid, n.b, n), m.extra)).then((ok) => {
        if (ok || versuche > 5) return;
        // kam nicht bei ntfy an (kein Netz, Server weg): nicht als gemeldet zählen, in der nächsten Runde nochmal
        const id = n.o.publicOfferId, e = state.aktiv[id];
        if (e && !(e.k || []).some((x) => x.topic !== kanalFuer(n.b))) { delete state.aktiv[id]; speichere('aktiv', state.aktiv); }
        const inh = state.inhalte[inhaltOhnePreis(n.o)]; if (inh) inh.gemeldet = false;
        n.sendVersuche = versuche; n.nichtVor = Date.now() + 2 * MIN; // ntfy nicht erreichbar: in 2 Min. nochmal
        inWarteschlange(n, such);
        grundMerken(id, '– wartet: Senden an ntfy fehlgeschlagen, ' + versuche + '. Versuch');
      });
      merke(n, kanalFuer(n.b), sid, such);
    });
    for (const s in state.bestes) if (!s.startsWith(new Date().toDateString())) delete state.bestes[s];
    speichere('bestes', state.bestes);
    const rest = passend.length - einzeln.length + uebersprungen;
    if (rest > 0) {
      sende('+' + rest + ' weitere neue Frachten',
        'Es kamen mehr neue Angebote auf einmal, als einzeln geprüft und gemeldet werden. Schau in Timocom nach.', 2, 'articulated_lorry');
    }
  }

  // „Laden knapp: Ankunft ca. 18:25, offen bis 18:00 – Dispo fragen“
  const knappText = (b) => b.knapp.map((k) => (k.laden ? 'Laden' : 'Entladen') + ' knapp: Ankunft ca. ' + wann(k.ankunft) +
    ', offen bis ' + wann(k.schluss)).join(' · ') + ' – Dispo fragen';

  // Uhrzeit kurz: heute nur "16:00", morgen "morgen 07:00", sonst "13.11. 07:00"
  function wann(ms) {
    const d = new Date(ms), h = new Date();
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === h.toDateString()) return hm;
    const m = new Date(h); m.setDate(m.getDate() + 1);
    if (d.toDateString() === m.toDateString()) return 'morgen ' + hm;
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '. ' + hm;
  }
  // „heute 07:00–10:00“, „morgen 08:00–16:00“, „14.11. – 15.11., 08:00–16:00“
  function tagWort(iso) {
    if (!iso) return '';
    const h = new Date(); h.setHours(0, 0, 0, 0);
    const diff = Math.round((zeitpunkt(iso, '00:00') - h.getTime()) / (24 * STD));
    return diff === 0 ? 'heute' : diff === 1 ? 'morgen' : zeit(iso).trim();
  }
  function fensterKurz(p) {
    if (!p || !p.earliestLoadingDate) return '?';
    const u1 = String(p.earliestLoadingTime || '').slice(0, 5), u2 = String(p.latestLoadingTime || '').slice(0, 5);
    const d1 = p.earliestLoadingDate, d2 = p.latestLoadingDate || d1;
    const uhr = ohneUhrzeit(p) ? 'ohne Uhrzeit' : u1 && u2 && u1 !== u2 ? u1 + '–' + u2 : (u1 ? u1 + ' Uhr' : '');
    if (d1 === d2) return tagWort(d1) + (uhr ? ' ' + uhr : '');
    return tagWort(d1) + ' – ' + tagWort(d2) + (uhr ? ', ' + uhr : '');
  }
  const stadt = (p) => p ? (land(p.address.countryId) + String(p.address.city || p.address.zipCode || '?')
    .replace(/\s*\(.*?\)\s*/g, ' ').replace(/,.*$/, '').trim()) : '?';

  // Kompakte Meldung: Preis vorne im Titel, darunter 4–6 kurze Zeilen mit festen Symbolen
  //   🕐 Zeiten · 🛣 Strecke/Ladung · 💶 Überschuss · ↩ Rückladung · 📞 Kontakt · ℹ Hinweis
  function formatiereKompakt(n) {
    const o = n.o, b = n.b, d = n.d || {}, r = n.rueck;
    const pl = o.loadingplaces || [];
    const start = pl.find((p) => p.loadingType === 'LOADING') || pl[0];
    const zeilen = [];
    const mk = merkmale(o, n.d);

    // Lade- und Entladezeit so, wie sie im Angebot stehen (Zeitfenster von–bis)
    const ladeOrte = pl.filter((p) => p.loadingType === 'LOADING'), entladeOrte = pl.filter((p) => p.loadingType !== 'LOADING');
    zeilen.push('🕐 Laden: ' + fensterKurz(ladeOrte[0] || start) + (ladeOrte.length > 1 ? ' (' + ladeOrte.length + ' Ladestellen)' : ''));
    zeilen.push('🕐 Entladen: ' + fensterKurz(entladeOrte[0] || pl[pl.length - 1]) + (entladeOrte.length > 1 ? ' (' + entladeOrte.length + ' Entladestellen)' : '') +
      (b.mitRueck ? ' · 🏠 zurück ca. ' + wann(b.zurueck) : '') + (b.tage >= 1.95 ? ' · ' + zahl(b.tage, 1) + ' Fahrertage' : ''));
    if (b.knapp) zeilen.push('⚠️ ' + knappText(b));
    const km = b.leerKm + b.lastKm + (b.mitRueck ? b.rueckKm : 0);
    zeilen.push('🛣 ' + zahl(b.leerKm, 0) + ' + ' + zahl(b.lastKm, 0) + (b.mitRueck ? ' + ' + zahl(b.rueckKm, 0) : '') + ' km' +
      (b.abOrt ? ' · Anfahrt ab ' + b.abOrt : '') + (b.lkwRoute ? ' (LKW-Route)' : (b.abOrt ? '' : '')) +
      (pl.length > 2 ? ' (' + pl.length + ' Stopps)' : '') + ' · ' + zahl(o.freightLengthInMeters || 0, 1) + ' m · ' +
      zahl(o.freightWeightInTons || 0, 1) + ' t');
    if (mk.length) zeilen.push('✅ Passt: ' + mk.join(' · ') + (mk.indexOf('Zoll') !== -1 ? ' → Auflieger mit Zollschnur' : ''));
    const zz = zahlungsziel(n.d);
    const folgeHinweis = b.folgetour ? ' · Folgetour: ' + (Number(einst.folgetourAnteil) || 0) + ' % Tagessatz' : '';
    const zahlung = folgeHinweis + (zz ? ' · Zahlung ' + zz + ' Tage' + (zz > einst.zahlungszielWarnAb ? ' ⚠️' : '') : '');
    if (b.preis) {
      const plus = b.preis - b.kosten;
      zeilen.push('💶 ' + (plus >= 0 ? '+' : '−') + euro(Math.abs(plus)) + (plus >= 0 ? ' über' : ' unter') + ' Kosten · ' +
        zahl(b.preis / Math.max(1, km)) + ' €/km' +
        (n.preisGeaendert ? ' · vorher ' + (n.alterPreis ? euro(n.alterPreis) : 'ohne Preis') : '') + zahlung);
    } else {
      zeilen.push('💶 Preis abklären: mindestens ' + euro(b.mindestpreis) + (b.mitRueck ? ' inkl. Rückfahrt' : '') +
        (b.tagestour && !b.mitRueck ? ' (mit Heimfahrt ' + euro(b.kostenHeim) + ')' : '') + ' · Vorschlag ' + euro(vorschlag(b)) + zahlung);
    }
    if (b.leerHeimDeckung != null) zeilen.push('🏠 Rückladung in Sicht – ohne Rückladung (leer heim, ' + zahl(b.rueckKm, 0) + ' km) wären es ' + Math.round(b.leerHeimDeckung) + ' %');
    if (b.deckungOhneHeim != null) zeilen.push('🏠 Leerfahrt heim eingerechnet: ' + zahl(b.rueckKm, 0) + ' km, zurück ca. ' + wann(b.zurueck) +
      ' · mit Rückladung statt leer wären es ' + Math.round(b.deckungOhneHeim) + ' %');
    else if (heimGedeckt(b) && !b.mitRueck && b.leerHeimDeckung == null) zeilen.push('🏠 Leer heim: ' + zahl(b.rueckKm, 0) + ' km, zurück ca. ' + wann(b.zurueck) +
      ' · mit Heimfahrt ' + Math.round(b.deckungHeim) + ' % gedeckt');
    else if (zielNahHeim(b) && !b.mitRueck) zeilen.push('🏠 Ziel nur ca. ' + zahl(b.zielHeimKm * einst.umwegFaktor, 0) + ' km vor ' + heimName() +
      ' – danach leer heim, Rückladung egal');
    if (r && !r.fehler) {
      const bew = r.bewertung === 'schlecht' && rueckGerettet(n) ? 'dünn' : r.bewertung; // wenig Auswahl, aber eine gute Folgeladung
      const symbol = { gut: '🟢', mittel: '🟡', dünn: '🟡', schlecht: '🔴' }[bew];
      zeilen.push('↩ Rückladung Richtung ' + heimName() + ' ' + symbol + ' ' + bew + ' · ' + r.gross + (r.voll ? '+' : '') + (r.gross === 1 ? ' Ladung' : ' Ladungen') +
        (r.median !== null ? ' · ' + zahl(r.median) + ' €/km' : '') +
        (r.wochenende ? ' · Entladung ' + r.tag + ': gezählt nur, was bis Sa. ankommt' + (r.spaeter ? ' (' + r.spaeter + ' erst ab Mo.)' : '') : ''));
    } else if (r && r.fehler) {
      zeilen.push('↩ Rückladung nicht geprüft: ' + ({ 'schonend übersprungen': 'zu viele Angebote auf einmal', 'Stundenlimit erreicht': 'Abfrage-Limit pro Stunde erreicht', 'Kontakte gehen vor': 'viele Angebote gerade, Abfragen bleiben für Kontaktdaten' }[r.fehler] || r.fehler));
    }
    if (n.anschluss) zeilen.push('➡️ ' + anschlussText(n));
    const cp = d.contactPerson || {}, cu = d.customer || {};
    const firma = String(cu.name || o.customerName || '?').slice(0, 32);
    const tel = cp.phone || cp.mobilePhone || cu.phone;
    zeilen.push('📞 ' + [firma + (o.ratingCount ? ' ★' + zahl(o.ratingAverage, 1) : ''), cp.name, tel,
      cp.mobilePhone && cp.mobilePhone !== tel ? 'mobil ' + cp.mobilePhone : null].filter(Boolean).join(' · ') +
      (!tel && n.d && !(n.mail || emailVon(n.d)) ? ' · nur Messenger' : '') + (n.kontaktFehler ? ' · Kontakt nicht abrufbar' : ''));
    const mailK = n.mail || emailVon(n.d);
    if (mailK) zeilen.push('✉ ' + mailK + ' · Knopf „E-Mail-Anfrage“ = fertiger Text');
    const fd = d.freightDescription || {};
    const hinweis = [fd.typeOfGoods && fd.typeOfGoods.trim(), d.publicRemark && d.publicRemark.trim()].filter(Boolean).join(' · ');
    if (hinweis) zeilen.push('ℹ ' + (hinweis.length > 400 ? hinweis.slice(0, 398) + '…' : hinweis)); // ganze Beschreibung (wird nur bei Platzmangel gekürzt)

    if (n.neuEingestellt) zeilen.push('♻️ Neu eingestellt – war schon gemeldet');
    if (n.knapp && b.preis) zeilen.unshift('🤏 Knapp: ' + Math.round(b.deckung) + ' % – Preisvorschlag ' + euro(knappVorschlag(b)) + ' (100 % = ' + euro(Math.ceil(preis100(b) / 10) * 10) + ')');
    if (n.rueckZu) zeilen.unshift('🔙 Rückweg nach deiner Tour ' + (n.rueckZu.tour || ('nach ' + n.rueckZu.ort)) + ' · frei ab ' + wann(n.rueckZu.ende));
    const titel = (n.rueckZu ? '🔙 ' : '') + (n.knapp ? '🤏 ' : '') + (n.stamm ? '🤝 ' : '') + (mk.length ? '✅ ' : '') + (n.preisGeaendert ? '🔄 ' : '') +
      (b.preis ? euro(b.preis) + ' (' + Math.round(b.deckung) + ' %)' : 'Preis abklären') +
      ' · ' + stadt(start) + ' → ' + stadt(pl[pl.length - 1]) + (b.knapp ? ' ⚠️' : '');
    return { titel: titel, text: zeilen.join('\n'), extra: { actions: aktionen(o, d, n) /* kein click: Tippen öffnet die ntfy-App, Timocom über den Knopf */ } };
  }
  const timocomLink = (o) => 'https://my.timocom.com/app/tccargo/freights/search/view/' + encodeURIComponent(o.publicOfferId);
  function aktionen(o, d, n) {
    const cp = (d && d.contactPerson) || {}, cu = (d && d.customer) || {};
    const tel = cp.phone || cp.mobilePhone || cu.phone;
    const mail = n && n.b ? (n.mail || emailVon(d)) : null;
    const a = [];
    if (tel) a.push({ action: 'view', label: 'Anrufen', url: telLink(tel), clear: false });
    if (mail) a.push({ action: 'view', label: '✉ E-Mail-Anfrage', url: mailLink(n, mail), clear: false });
    else if (cp.mobilePhone && cp.mobilePhone !== tel) a.push({ action: 'view', label: 'Mobil', url: telLink(cp.mobilePhone), clear: false });
    a.push({ action: 'view', label: 'In Timocom', url: timocomLink(o), clear: false });
    return a.slice(0, 3);
  }

  // ---------- Meldung im Aufbau eines Timocom-Angebots ----------
  // Titel wie die Timocom-Zeile: Farbe · Start → Ziel · Preis · Deckung
  // Darunter feste Felder in der Reihenfolge der Timocom-Detailseite:
  //   Laden · Entladen · Fracht · Preis · Rechnung · Firma · Kontakt · Ware/Hinweis (+ nur wenn wichtig: ⚠️-Zeile)
  const md = (t) => String(t == null ? '' : t).replace(/([\\`*_\[\]#<>|~])/g, '\\$1');
  const ortVoll = (p) => p && p.address ? [(state.laender[p.address.countryId] || 'DE'), p.address.zipCode, String(p.address.city || '').replace(/\s*\(.*?\)\s*/g, ' ').trim()].filter(Boolean).join(' ') : '?';
  function formatiereTimocom(n) {
    const o = n.o, b = n.b, d = n.d || {}, r = n.rueck;
    const pl = o.loadingplaces || [];
    const ladeOrte = pl.filter((p) => p.loadingType === 'LOADING'), entladeOrte = pl.filter((p) => p.loadingType !== 'LOADING');
    const start = ladeOrte[0] || pl[0], ziel = entladeOrte[entladeOrte.length - 1] || pl[pl.length - 1];
    const z = [];
    const feld = (name, wert) => { if (wert) z.push('**' + name + ':** ' + wert); };
    const mehr = (anz, wort) => (anz > 1 ? ' (+' + (anz - 1) + ' ' + wort + ')' : '');
    feld('Laden', md(fensterKurz(start)) + ' · ' + md(ortVoll(start)) + mehr(ladeOrte.length, 'weitere'));
    feld('Entladen', md(fensterKurz(ziel)) + ' · ' + md(ortVoll(ziel)) + mehr(entladeOrte.length, 'weitere'));
    feld('Fracht', [zahl(o.freightLengthInMeters || 0, 1) + ' m', zahl(o.freightWeightInTons || 0, 1) + ' t', zahl(b.lastKm, 0) + ' km'].join(' · '));
    const zz = zahlungsziel(n.d);
    if (b.preis) {
      feld('Preis', '**' + euro(b.preis) + '**' + (zz ? ' · Zahlungsziel ' + zz + ' Tage' + (zz > einst.zahlungszielWarnAb ? ' ⚠️' : '') : '') +
        (n.preisGeaendert ? ' · vorher ' + (n.alterPreis ? euro(n.alterPreis) : 'ohne Preis') : ''));
      const plus = b.preis - b.kosten;
      const kmGes = b.leerKm + b.lastKm + (b.mitRueck ? b.rueckKm : 0);
      feld('Kosten', euro(b.kosten) + ' (' + zahl(kmGes, 0) + ' km inkl. ' + zahl(b.leerKm, 0) + ' km Anfahrt' + (b.abOrt ? ' ab ' + md(b.abOrt) : '') +
        (b.mitRueck ? ' und ' + zahl(b.rueckKm, 0) + ' km heim' : '') + ', ' + (b.tage >= 1.95 ? zahl(b.tage, 1) + ' Fahrertage' : '1 Fahrertag') + (b.folgetour ? ' als Folgetour' : '') +
        ') → **' + Math.round(b.deckung) + ' %** · ' + (plus >= 0 ? '+' : '−') + euro(Math.abs(plus)));
    } else {
      feld('Preis', '**abklären** · mind. ' + euro(b.mindestpreis) + ' · Vorschlag ' + euro(vorschlag(b)) + (zz ? ' · Zahlungsziel ' + zz + ' Tage' : ''));
    }
    // Nur das Wichtigste als Hinweis-Zeile
    const warn = [];
    if (b.knapp) warn.push(knappText(b));
    if (r && !r.fehler && r.bewertung === 'schlecht' && !rueckGerettet(n)) warn.push('Rückladung Richtung ' + heimName() + ' schlecht');
    const mk = merkmale(o, n.d);
    if (mk.length) warn.push('passt: ' + mk.join(', ') + (mk.indexOf('Zoll') !== -1 ? ' (Auflieger mit Zollschnur)' : ''));
    if (n.anschluss && n.anschluss.b && n.anschluss.b.deckung !== null) warn.push('danach Folgeladung ab ' + stadt((n.anschluss.o.loadingplaces || [])[0]) + ' möglich');
    if (warn.length) z.push('⚠️ ' + md(warn.join(' · ')));
    const cp = d.contactPerson || {}, cu = d.customer || {};
    const tel = cp.phone || cp.mobilePhone || cu.phone;
    feld('Firma', md(String(cu.name || o.customerName || '?').slice(0, 40)) + (o.ratingCount ? ' ★' + zahl(o.ratingAverage, 1) : '') + (n.stamm ? ' · 🤝 Stammkunde' : ''));
    const mail = n.mail || emailVon(n.d);
    feld('Kontakt', md([cp.name, tel].filter(Boolean).join(' · ') || (n.d ? 'nur Timocom-Messenger' : 'nicht abgerufen')) + (mail ? ' · E-Mail' : ''));
    const fd = d.freightDescription || {};
    const ware = [fd.typeOfGoods && fd.typeOfGoods.trim(), d.publicRemark && d.publicRemark.trim()].filter(Boolean).join(' · ');
    if (ware) feld('Ware', md(ware.length > 90 ? ware.slice(0, 88) + '…' : ware));
    const fa = FARBEN[farbeVon(b, rueckFuerFarbe(n))];
    const titel = (fa ? fa.symbol + ' ' : '') + stadt(start) + ' → ' + stadt(ziel) + ' · ' +
      (b.preis ? euro(b.preis) + ' · ' + Math.round(b.deckung) + ' %' : 'Preis abklären');
    return { titel: titel, text: z.join('  \n'), mitFarbe: true, extra: { markdown: true, actions: aktionen(o, d, n) } };
  }

  function formatiere(n) {
    if (einst.timocomAufbau === true) return formatiereTimocom(n);
    if (einst.kompakt) return formatiereKompakt(n);
    const o = n.o, b = n.b, d = n.d || {}, r = n.rueck;
    const pl = o.loadingplaces || [];
    const laden = pl.filter((p) => p.loadingType === 'LOADING');
    const entladen = pl.filter((p) => p.loadingType !== 'LOADING');
    const zeilen = [];

    zeilen.push('Laden: ' + fenster(laden[0]) + (b.ankunftLaden ? ' · Ankunft ca. ' + uhrzeit(b.ankunftLaden).slice(7) : ''));
    zeilen.push('Entladen: ' + fenster(entladen[entladen.length - 1]) + ' · fertig ca. ' + uhrzeit(b.ende));
    if (b.knapp) zeilen.push('⚠️ ' + knappText(b));
    if (b.mitRueck) zeilen.push('Leer zurück zum Standort: ' + zahl(b.rueckKm, 0) + ' km · da ca. ' + uhrzeit(b.zurueck) + ' (in Kosten enthalten)');
    else if (heimGedeckt(b)) zeilen.push('Tagestour: leer heim ' + zahl(b.rueckKm, 0) + ' km, da ca. ' + uhrzeit(b.zurueck) +
      ' · inkl. Heimfahrt ' + Math.round(b.deckungHeim) + ' % gedeckt (Kosten ' + euro(b.kostenHeim) + ')');
    else if (zielNahHeim(b)) zeilen.push('Ziel nur ca. ' + zahl(b.zielHeimKm * einst.umwegFaktor, 0) + ' km vor ' + heimName() + ' – danach leer heim, Rückladung nicht nötig');
    if (pl.length > 2) {
      zeilen.push('Stopps: ' + pl.map((p) => (p.loadingType === 'LOADING' ? '↑ ' : '↓ ') + ort(p)).join(' · '));
    }
    zeilen.push('Leer ' + zahl(b.leerKm, 0) + ' km + ' + zahl(b.lastKm, 0) + ' km · ' +
      zahl(o.freightLengthInMeters || 0) + ' m · ' + zahl(o.freightWeightInTons || 0) + ' t');
    const mkL = merkmale(o, n.d);
    if (mkL.length) zeilen.push('Passt zu uns: ' + mkL.join(' · ') + (mkL.indexOf('Zoll') !== -1 ? ' → Auflieger mit Zollschnur nehmen' : ''));

    const gesamtKm = Math.max(1, b.leerKm + b.lastKm + (b.mitRueck ? b.rueckKm : 0));
    if (b.preis) {
      let z = 'Preis ' + euro(b.preis) + ' · Kosten ' + euro(b.kosten) + (b.tage >= 1.95 ? ' (' + zahl(b.tage, 1) + ' Fahrertage)' : '') +
        ' · Deckung ' + Math.round(b.deckung) + ' %';
      if (n.preisGeaendert) z += ' (vorher ' + (n.alterPreis ? euro(n.alterPreis) : 'ohne Preis') + ')';
      zeilen.push(z);
      zeilen.push(zahl(b.preis / gesamtKm) + ' €/km · ' + zahl(b.preis / Math.max(0.5, b.einsatzStunden), 0) + ' €/Std. · Einsatz ' +
        zahl(b.einsatzStunden, 1) + ' Std.' + (b.warteStunden >= 0.5 ? ' (davon ' + zahl(b.warteStunden, 1) + ' warten)' : ''));
    } else {
      zeilen.push('Preis abklären → mindestens ' + euro(b.mindestpreis) + (b.tagestour && !b.mitRueck ? ' (mit Heimfahrt ' + euro(b.kostenHeim) + ')' : '') +
        ' · Vorschlag ' + euro(vorschlag(b)) + ' (Kosten ' + euro(b.kosten) + ')');
      zeilen.push('Einsatz ' + zahl(b.einsatzStunden, 1) + ' Std.' +
        (b.warteStunden >= 0.5 ? ' (davon ' + zahl(b.warteStunden, 1) + ' warten)' : ''));
    }

    if (r && !r.fehler) {
      const symbol = { gut: '🟢', mittel: '🟡', schlecht: '🔴' }[r.bewertung];
      zeilen.push('Rückladung ' + r.ort + ' Richtung ' + heimName() + ': ' + symbol + ' ' + r.bewertung + ' – ' + r.gross + (r.voll ? '+' : '') +
        ' Angebote ab 7 m' + (r.median !== null ? ', Median ' + zahl(r.median) + ' €/km' : ''));
    } else if (r && r.fehler) {
      zeilen.push('Rückladung: nicht geprüft (' + r.fehler + ')');
    }
    if (n.anschluss) zeilen.push(anschlussText(n));

    const fd = d.freightDescription || {};
    const extraInfo = [];
    if (fd.typeOfGoods && fd.typeOfGoods.trim()) extraInfo.push('Ware: ' + fd.typeOfGoods.trim());
    const zzL = zahlungsziel(n.d);
    if (zzL) extraInfo.push('Zahlung ' + zzL + ' Tage' + (zzL > einst.zahlungszielWarnAb ? ' ⚠️' : ''));
    if (o.loadingEquipmentExchange && o.loadingEquipmentExchange !== 'NO') extraInfo.push('Lademitteltausch');
    if (extraInfo.length) zeilen.push(extraInfo.join(' · '));
    if (d.publicRemark && d.publicRemark.trim()) zeilen.push('Hinweis: ' + d.publicRemark.trim().slice(0, 140));

    const cp = d.contactPerson || {}, cu = d.customer || {};
    const firma = cu.name || o.customerName || '?';
    let bewertungFirma = '';
    if (o.ratingCount) bewertungFirma = ' (★ ' + zahl(o.ratingAverage, 1) + ' aus ' + o.ratingCount + ')';
    zeilen.push('Firma: ' + firma + bewertungFirma);
    const tel = cp.phone || cp.mobilePhone || cu.phone;
    if (cp.name || tel) zeilen.push('Kontakt: ' + [cp.name, cp.phone, cp.mobilePhone && cp.mobilePhone !== cp.phone ? cp.mobilePhone : null].filter(Boolean).join(' · '));
    if (cu.phone && cu.phone !== cp.phone) zeilen.push('Zentrale: ' + cu.phone);
    const mailL = n.mail || emailVon(n.d);
    if (mailL) zeilen.push('E-Mail: ' + mailL + ' (Knopf „E-Mail-Anfrage“ öffnet den fertigen Text)');
    if (!tel && !mailL && n.d) zeilen.push('Kontakt nur über den Timocom-Messenger');
    if (n.kontaktFehler) zeilen.push('Kontakt nicht abrufbar (' + n.kontaktFehler + ')');

    let kopf = (n.stamm ? '🤝 ' : '') + (mkL.length ? '✅ ' : '');
    if (n.preisGeaendert) kopf += 'Preis geändert: ';
    const titel = kopf + strecke(o) + ' · ' + (b.preis ? euro(b.preis) + ' (' + Math.round(b.deckung) + ' %)' : 'Preis abklären');
    return { titel: titel, text: zeilen.join('\n'), extra: { actions: aktionen(o, d, n) /* kein click: Tippen öffnet die ntfy-App, Timocom über den Knopf */ } };
  }

  function warne(titel, text) {
    if (state.gewarnt) return;
    state.gewarnt = true;
    sende(titel, text, 4, 'warning');
  }

  // Länder- und Währungskürzel aus der angezeigten Tabelle lernen
  function lerneAusTabelle() {
    let geaendert = false;
    document.querySelectorAll('[data-testid^="OfferTable/table/row"]').forEach((row) => {
      const id = row.dataset.testid.replace('OfferTable/table/row', '');
      const o = state.letzteZeilen.get(id);
      if (!o) return;
      const ladeZelle = row.querySelector('[data-testid$="_cell_loadingAddress"]');
      const start = (o.loadingplaces || []).find((p) => p.loadingType === 'LOADING');
      if (ladeZelle && start && start.address) {
        const c = (ladeZelle.innerText || '').trim().split(/\s+/)[0];
        if (/^[A-Z]{1,3}$/.test(c) && state.laender[start.address.countryId] !== c) {
          state.laender[start.address.countryId] = c; geaendert = true;
        }
      }
      const preisZelle = row.querySelector('[data-testid$="_cell_price"]');
      if (preisZelle && o.price) {
        const w = (preisZelle.innerText || '').trim().split(/\s+/).pop();
        if (/^[A-Z]{3}$/.test(w) && state.waehrungen[o.price.currencyId] !== w) {
          state.waehrungen[o.price.currencyId] = w; geaendert = true;
        }
      }
    });
    if (geaendert) { speichere('laender', state.laender); speichere('waehrungen', state.waehrungen); }
  }

  // ------------------------------ Wachhund ------------------------------
  const aufSuchseite = () => location.pathname.indexOf('/freights/search') !== -1;

  let pcPulsT = 0, pcPulsKey = '';
  function pcLebenszeichen() {
    if (!binLeiter && leiterFrisch()) return; // 👁 ein anderer Tab prüft und meldet sich
    const jetzt = Date.now(), suche = aufSuchseite(), dienst = imDienst();
    const listeAlt = !state.letzteAntwort || jetzt - state.letzteAntwort > 5 * MIN;
    const ab = !!state.abgemeldetT && jetzt - state.abgemeldetT < 30 * MIN;
    // Ist Timocom noch in einem zweiten Tab offen (z. B. ein Angebot oder eine andere Seite), schweigt dieser Tab,
    // solange ein anderer Tab frische Suchlisten bekommt – sonst meldet er der App fälschlich „Suche nicht offen“
    if ((!suche || listeAlt) && !ab) { const anderer = lade('listeT', 0); if (jetzt - anderer < 3 * MIN && anderer > (state.letzteAntwort || 0)) return; }
    const listen = aktiveListen().filter((k) => state.anzahl[k] !== undefined); // gerade erst „Gehirn“ geworden: nur schon gesehene Listen
    const key = [suche, listeAlt, dienst, ab, listen.length].join('|');
    if (key === pcPulsKey && jetzt - pcPulsT < 10 * MIN) return; // rund um die Uhr alle 10 Min.
    pcPulsKey = key; pcPulsT = jetzt;
    // nicht angekommen (z. B. ntfy „zu viele Anfragen“ gerade beim Löschen): in einer Minute nochmal statt erst in 10
    // Was hat der Wächter in der letzten Stunde geprüft und gemeldet? (für „läuft, aber nichts Passendes dabei“)
    let geprueft = 0, gemeldet = 0;
    for (const k in state.gruende) {
      const g = state.gruende[k];
      if (!g || g.t < jetzt - STD) continue;
      if (/^(✓|→)/.test(g.x)) { geprueft++; gemeldet++; } else if (/^✗|^– (doppelt|gleiche|Preis nur)/.test(g.x)) geprueft++;
    }
    pcMelden({ liste: state.letzteAntwort || 0, suche: suche, dienst: dienst, abgemeldet: ab, ab: Number(einst.aktivVon), bis: Number(einst.aktivBis),
      angebote: listen.length ? listen.reduce((n, k) => n + (state.anzahl[k] || 0), 0) : (state.angebote || 0), listen: listen.length,
      voll: listen.some((k) => (state.anzahl[k] || 0) >= 500),
      je: listen.map((k) => { const i = state.listenInfo[k] || {}; return [state.anzahl[k] || 0, i.tag || '', i.sort || '', i.bis === undefined ? null : i.bis]; }),
      std: [geprueft, gemeldet], warte: (state.nachzuegler || []).length,
      pruefung: state.pruefungLaeuft ? Math.round((jetzt - (state.pruefungSeit || jetzt)) / 1000) : 0, haenger: state.haengerT || 0 })
      .then((ok) => { if (!ok && pcPulsT === jetzt) { pcPulsT = 0; pcPulsKey = ''; } });
  }
  // 📊 Gründe der letzten Stunde, zusammengefasst (z. B. „✗ Deckung #“: 212×) – zeigt, ob ein Filter zu viel aussortiert
  function gruendeStatistik() {
    const grenzeT = Date.now() - STD, zaehl = {};
    for (const id in state.gruende) {
      const g = state.gruende[id];
      if (!g || g.t < grenzeT) continue;
      const key = String(g.x).replace(/\([^)]*\)/g, '').replace(/„[^“]*“/g, '„…“').replace(/\d+(?:[.,]\d+)*/g, '#').replace(/\s+/g, ' ').trim().slice(0, 60);
      const z = zaehl[key] = zaehl[key] || { n: 0, b: [] };
      z.n++;
      if (z.b.length < 2) {
        const e = state.tabelle.get(id);
        z.b.push((e && e.s ? e.s.replace(/\b\d{5} /g, '') : id) + (e && e.p ? ' ' + e.p + ' €' : '') + (e && e.farbe ? ' [' + e.farbe + ']' : '') + ' · ' + String(g.x).slice(0, 70));
      }
    }
    return Object.keys(zaehl).map((k) => [k, zaehl[k].n, zaehl[k].b]).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }

  // 🧪 Datenprobe: die aktuellen Suchlisten + zuletzt abgerufene Details (ohne Ansprechpartner, Telefon, E-Mail) als Datei in den
  // Kanal …-diag (verfällt nach 24 Std.). Damit lässt sich jeder Filter mit echten Timocom-Daten nachprüfen. Einmal je Version + per Knopf.
  const probeListen = new Map(), probeDetails = [];
  function maskiert(x, feld, tiefe) {
    if (x == null || tiefe > 9) return x;
    if (typeof x === 'string') {
      // nur E-Mail-Adressen und Telefonnummern im Text unkenntlich machen – die Beschreibung selbst bleibt (für ADR-, Gewichts- und Wortprüfungen)
      return x.replace(/[^\s@<>()"',;]+@[^\s@<>()"',;]+/g, 'MAIL').replace(/(?:\+|(?<![\d.-])0)\d[\d\s/()-]{5,}\d/g, (t) => (t.replace(/\D/g, '').length >= 7 ? 'TEL' : t));
    }
    if (Array.isArray(x)) return x.map((v) => maskiert(v, feld, tiefe + 1));
    if (typeof x !== 'object') return x;
    const aus = {};
    Object.keys(x).forEach((k) => {
      if (/^(contactPerson|contactPersons|contactChannels|instantMessenger)$/i.test(k)) { aus[k] = 'ENTFERNT'; return; }
      if (/(mail|phone|fax|mobile|messenger)/i.test(k)) { aus[k] = x[k] ? 'ENTFERNT' : x[k]; return; }
      aus[k] = maskiert(x[k], k, tiefe + 1);
    });
    return aus;
  }
  let probeT = 0;
  function probeSenden(grund) {
    if (!origFetch || CONFIG.TESTMODUS || !binLeiter || !probeListen.size) return Promise.resolve(false);
    if (grund !== 'knopf' && (lade('probeV', '') === WAECHTER_VERSION || Date.now() - probeT < 30 * MIN)) return Promise.resolve(false);
    probeT = Date.now();
    const einstOffen = Object.assign({}, einst); ['ntfyToken', 'ntfyKanal', 'mailTelefon', 'mailSignatur'].forEach((k) => delete einstOffen[k]);
    const ids = new Set();
    const listen = Array.from(probeListen.values()).filter((l) => Date.now() - l.t < 10 * MIN).map((l) => {
      l.zeilen.forEach((o) => o && ids.add(o.publicOfferId));
      return { t: l.t, filter: l.filter, zeilen: maskiert(l.zeilen, '', 0) };
    });
    const gruende = {}, tabelle = {};
    ids.forEach((id) => { if (state.gruende[id]) gruende[id] = state.gruende[id]; const e = state.tabelle.get(id); if (e) tabelle[id] = { f: e.farbe, d: e.deckung }; });
    const daten = { v: WAECHTER_VERSION, t: Date.now(), grund: grund, einst: einstOffen, pos: state.letztePos || null, rio: state.rio && state.rio.lkw ? state.rio.lkw.map((l) => ({ lat: l.lat, lon: l.lon, zeit: l.zeit })) : null,
      listen: listen, details: maskiert(probeDetails.slice(0, 40), '', 0), gruende: gruende, tabelle: tabelle, aktiv: Object.keys(state.aktiv).length };
    const text = JSON.stringify(daten);
    if (text.length > 20 * 1024 * 1024) return Promise.resolve(false);
    return meinFetch(CONFIG.NTFY_SERVER + '/' + encodeURIComponent(CONFIG.NTFY_KANAL + '-diag'), { method: 'PUT', body: text,
      headers: ntfyHeaders({ 'Filename': 'probe-' + WAECHTER_VERSION + '.json' }) }).then((r) => { if (r.ok) speichere('probeV', WAECHTER_VERSION); return r.ok; }).catch(() => false);
  }

  // 🔎 Warum nicht gemeldet? Alle Angebote, die in Timocom 🥇/🟢/🟡 gefärbt sind, aber nicht in der App stehen – mit Grund.
  // Geht an den Kanal …-warum (höchstens alle 3 Min., nur bei Änderung), damit man es auch ohne Blick auf den PC sieht.
  let warumT = 0, warumHash = '';
  function warumSenden() {
    if (!binLeiter || !origFetch || CONFIG.TESTMODUS || !imDienst()) return;
    const jetzt = Date.now();
    if (jetzt - warumT < 3 * MIN) return;
    const rang = { gold: 0, gruen: 1, gelb: 2 };
    const liste = [];
    for (const [id, e] of state.tabelle) {
      if (!e || !(e.farbe in rang) || state.aktiv[id] || jetzt - (e.t || 0) > 3 * MIN) continue;
      const g = state.gruende[id];
      liste.push({ id: id, f: e.farbe, s: e.s || '', p: e.p, d: e.deckung == null ? null : Math.round(e.deckung), lt: e.lt || '',
        g: g ? String(g.x).slice(0, 110) : (state.gesehen[id] ? '– noch nicht geprüft' : '– unbekannt'), gt: g ? g.t : 0 });
    }
    liste.sort((a, b) => (rang[a.f] - rang[b.f]) || ((b.d || 0) - (a.d || 0)));
    while (liste.length && JSON.stringify(liste).length > 3500) liste.pop();
    const h = hash(JSON.stringify(liste.map((x) => [x.id, x.g])));
    if (h === warumHash && jetzt - warumT < 15 * MIN) return;
    warumHash = h; warumT = jetzt;
    try { zaehleNtfy(); } catch (e) { /* egal */ }
    meinFetch(CONFIG.NTFY_SERVER + '/' + encodeURIComponent(CONFIG.NTFY_KANAL + '-warum'), { method: 'POST', headers: ntfyHeaders(),
      body: (() => { let stat = gruendeStatistik(), txt = JSON.stringify({ v: WAECHTER_VERSION, t: jetzt, n: liste, stat: stat });
        while (txt.length > 3900 && stat.length) { stat = stat.slice(0, -1); txt = JSON.stringify({ v: WAECHTER_VERSION, t: jetzt, n: liste, stat: stat }); }
        return txt; })() }).catch(() => { warumT = 0; });
  }
  // ⬆ Automatische Updates: neue Version auf GitHub? Dann Knopf im Kasten (ein Klick, Tampermonkey fragt „Aktualisieren“) und eine Meldung
  const UPDATE_META = 'https://zoranovic94.github.io/Fracht/waechter.meta.js';
  const UPDATE_SKRIPT = 'https://zoranovic94.github.io/Fracht/waechter.user.js';
  function versionNeuer(a, b) {
    const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
    return false;
  }
  let updateT = 0;
  function updatePruefen() {
    if (!origFetch || CONFIG.TESTMODUS || Date.now() - updateT < 30 * MIN) return;
    updateT = Date.now();
    meinFetch(UPDATE_META + '?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => {
      const m = /@version\s+(\S+)/.exec(t || '');
      const neu = m && versionNeuer(m[1], WAECHTER_VERSION) ? m[1] : null;
      if (neu !== state.updateDa) { state.updateDa = neu; zeichne(); }
      if (neu && binLeiter && imDienst() && lade('updateGemeldet', '') !== neu) {
        speichere('updateGemeldet', neu);
        sende('⬆ Fracht-Wächter ' + neu + ' ist da', 'Am PC im Wächter-Kasten auf „Update installieren“ klicken, in Tampermonkey „Aktualisieren“ wählen und danach beide Timocom-Tabs neu laden (F5).', 3, 'arrow_up');
      }
    }).catch(() => { updateT = Date.now() - 25 * MIN; }); // kein Netz: in 5 Min. nochmal
  }
  setTimeout(updatePruefen, 20 * 1000);
  const startT = Date.now();
  setTimeout(pcLebenszeichen, 15 * 1000);
  setInterval(() => {
    try { pcLebenszeichen(); } catch (e) { /* egal */ }
    try { warumSenden(); } catch (e) { /* egal */ }
    try { updatePruefen(); } catch (e) { /* egal */ }
    try { if (Date.now() - startT > 4 * MIN && probeListen.size) probeSenden('auto'); } catch (e) { /* egal */ }
    if (!aufSuchseite()) {
      state.letzteAntwort = 0;
      setzeStatus('Keine Frachtsuche offen');
      return;
    }
    if (state.letzteAntwort && !state.gewarnt && imDienst()) {
      const minuten = (Date.now() - state.letzteAntwort) / MIN;
      if (minuten >= CONFIG.WARNUNG_NACH_MINUTEN) {
        warne('Fracht-Wächter: keine Aktualisierung',
          'Seit ' + Math.round(minuten) + ' Minuten kam keine neue Suchliste von Timocom. Bitte am PC prüfen: ' +
          'noch eingeloggt? „Automatisch aktualisieren“ an? Tab noch offen?');
        setzeStatus('Keine Aktualisierung seit ' + Math.round(minuten) + ' Min.');
      }
    }
    zeichne();
  }, 30 * 1000);

  // ------------------------------ Anzeige ------------------------------
  let box = null;
  let zu = false;
  let einstOffen = false;

  function setzeStatus(s) { state.status = s; zeichne(); }

  const FELDER = [
    ['kostenProKm', 'Kosten je km (€)', 'number', '0.01'],
    ['fixkostenProTag', 'Fixkosten je Tag (€)', 'number', '1'],
    ['minDeckung', 'Melden ab Deckung (%)', 'number', '1'],
    ['toleranz', 'Puffer: so viel % darunter zählt noch (🟡)', 'number', '1'],
    ['knappAb', '🤏 Knapp darunter still mit Preisvorschlag ab (%)', 'number', '1'],
    ['standorte', 'LKW-Standorte (Name: Breite, Länge; …)', 'text'],
    ['minEuroKm', 'Mindestens € je gefahrenem km', 'number', '0.05'],
    ['mindestensEinTag', 'Mind. 1 Tagessatz je Ladung', 'checkbox'],
    ['folgetourAnteil', 'Folgetour: Anteil Tagessatz (%)', 'number', '5'],
    ['volleTage', 'Jeder Einsatztag = voller Tagessatz', 'checkbox'],
    ['stundenProTag', 'Einsatzstunden je Tag', 'number', '0.5'],
    ['kmh', 'Schnitt (km/h)', 'number', '1'],
    ['ladezeit', 'Beladen (Std.)', 'number', '0.25'],
    ['entladezeit', 'Entladen (Std.)', 'number', '0.25'],
    ['lkwRouting', 'Leer-km als LKW-Route (40 t) berechnen', 'checkbox'],
    ['orsKey', '… Schlüssel openrouteservice', 'text'],
    ['orsProTag', '… höchstens LKW-Routen am Tag', 'number', '10'],
    ['pufferMin', 'Spielraum nach Lade-/Entladeschluss (Min.)', 'number', '5'],
    ['ohnePreisMelden', 'Angebote ohne Preis melden', 'checkbox'],
    ['ohnePreisAbLdm', '… nur ab Lademeter', 'number', '0.5'],
    ['preisSammelMin', '🔵 ohne Preis: Sammelmeldung alle … Min. (0 = einzeln, mit ntfy-Token immer einzeln)', 'number', '5'],
    ['ntfyKanal', 'ntfy-Kanal (Name aus der ntfy-App)', 'text'],
    ['ntfyToken', 'ntfy-Token vom Abo (tk_…)', 'text'],
    ['appLink', '📱 Antippen öffnet die Fracht-App (Adresse, leer = ntfy-App)', 'text'],
    ['stummWennAppOffen', '📱 ntfy still, solange die Fracht-App offen ist', 'checkbox'],
    ['rueckCheck', 'Rückladung prüfen', 'checkbox'],
    ['rueckRadius', 'Rückladung Umkreis (km)', 'number', '5'],
    ['rueckPflichtAbKm', 'Rückweg immer prüfen, wenn das Ziel so weit weg ist (km)', 'number', '10'],
    ['heimName', '↩ Rückladung Richtung (Ort)', 'text'],
    ['heimKoord', '… Koordinaten (Breite, Länge)', 'text'],
    ['heimRadius', '… zählt bis so viele km davor', 'number', '5'],
    ['rueckSchlechtNurAb', 'Bei schlechter Rückladung ab (%)', 'number', '1'],
    ['kontaktAbrufen', 'Kontaktdaten mitschicken', 'checkbox'],
    ['maxAbfragenProStunde', 'Eigene Abfragen je Stunde höchstens', 'number', '5'],
    ['aktivVon', 'Arbeitszeit ab (Uhr)', 'number', '1'],
    ['aktivBis', 'Arbeitszeit bis (Uhr, gleich wie „ab“ = immer)', 'number', '1'],
    ['freiAb', 'LKW frei ab (leer = jetzt)', 'datetime-local'],
    ['heuteFertigBis', '☀️ Heute leer: fertig bis (Uhr, 24 = Mitternacht)', 'number', '1'],
    ['heuteMaxLeerKm', '☀️ Anfahrt höchstens (km)', 'number', '5'],
    ['heuteMaxLastKm', '☀️ Tour höchstens (km)', 'number', '10'],
    ['heuteOhnePreisAlle', '☀️ ohne Preis auch kleine Ladungen', 'checkbox'],
    ['zusatzMinDeckung', '☀️/🌙 melden ab Deckung (%)', 'number', '1'],
    ['nachtLadenAb', '🌙 Nacht: laden ab (Uhr, 0 = egal)', 'number', '1'],
    ['nachtAbendsAb', '🌙 Nacht: entladen fertig ab (Uhr abends)', 'number', '1'],
    ['nachtFertigBis', '🌙 Nacht: fertig bis (Uhr morgens)', 'number', '1'],
    ['rundLadenAb', '🔁 Nacht+zurück: laden ab (Uhr)', 'number', '1'],
    ['rundZurueckBis', '🔁 zurück am Standort bis (Uhr)', 'number', '1'],
    ['rundMinDeckung', '🔁 ab Deckung inkl. Rückfahrt (%)', 'number', '1'],
    ['zusatzOhneTagessatz', '☀️/🌙/🔁 ohne vollen Tagessatz', 'checkbox'],
    ['fernAbKm', '🛣️ Fern ab (km)', 'number', '10'],
    ['fernMinDeckung', '🛣️ Fern ab Deckung (%)', 'number', '1'],
    ['auslandAusschliessen', 'Ausländische Firmen ausblenden', 'checkbox'],
    ['erlaubteLaender', '… erlaubt sind Firmen aus', 'text'],
    ['nurDeutschland', 'Nur Touren innerhalb Deutschlands', 'checkbox'],
    ['maxGewicht', 'Nutzlast höchstens (t)', 'number', '0.5'],
    ['maxLadestellen', 'Ladestellen höchstens (0 = egal)', 'number', '1'],
    ['maxEntladestellen', 'Entladestellen höchstens (0 = egal)', 'number', '1'],
    ['gefahrgutAusschliessen', 'Gefahrgut/ADR nie melden (auch aus der Bemerkung)', 'checkbox'],
    ['ausschlussWoerter', 'Nicht melden, wenn im Angebot steht', 'text'],
    ['sperrFirmen', 'Nie melden: Firmen (mit Komma)', 'text'],
    ['stammFirmen', '🤝 Stammkunden: immer melden', 'text'],
    ['zahlungszielWarnAb', '⚠️ bei Zahlungsziel über (Tage)', 'number', '1'],
    ['mailTelefon', 'Telefon im E-Mail-Text', 'text'],
    ['mailSignatur', 'Text-Signatur (leer = Signatur der Mail-App)', 'textarea'],
    ['veralteteLoeschen', 'Weggefallene aus App löschen (Android)', 'checkbox'],
    ['timocomAufbau', '📱 Meldungen wie ein Timocom-Angebot aufbauen', 'checkbox'],
    ['kompakt', 'Kurze Meldungen (wenn nicht Timocom-Aufbau)', 'checkbox'],
    ['kuerzenFuerGoogle', 'Meldungen kürzen (aus bei „Sofortige Zustellung“)', 'checkbox'],
    ['logoUrl', 'Logo-Adresse (PNG/JPG)', 'text'],
    ['goldAb', '🥇 Gold ab Deckung (%)', 'number', '1'],
    ['gruenAb', '🟢 sehr gut ab Deckung (%)', 'number', '1'],
    ['gelbAb', '🟡 geht so ab Deckung (%)', 'number', '1'],
    ['heimfahrtEinrechnen', '🏠 Kurze Touren: Leerfahrt heim mitrechnen (zurück am selben Tag)', 'checkbox'],
    ['heimfahrtAb', '🏠 … nur wenn Entladung fertig ab (Uhr)', 'number', '1'],
    ['tagestourGruenAb', '🟢 Tagestour inkl. Heimfahrt ab (%)', 'number', '1'],
    ['tabelleFaerben', 'Timocom-Liste einfärben', 'checkbox'],
  ];

  function zeichne() {
    if (!document.body) return;
    if (!box) {
      box = document.createElement('div');
      box.id = 'mz-fracht-waechter';
      box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#fff;color:#222;' +
        'border:2px solid #c8102e;border-radius:8px;padding:8px 10px;font:12px/1.4 Arial,sans-serif;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.25);max-width:340px;max-height:80vh;overflow:auto;';
    }
    // Timocom baut die Seite beim Laden neu auf und wirft dabei den Kasten raus – dann neu anhängen.
    if (!box.isConnected) document.body.appendChild(box);
    if (!aufSuchseite()) { box.style.display = 'none'; return; }
    box.style.display = '';
    if (einstOffen && box.contains(document.activeElement)) return; // nicht beim Tippen neu zeichnen

    const uhr = state.letzteAntwort ? new Date(state.letzteAntwort).toLocaleTimeString('de-DE') : '–';
    box.innerHTML = '';
    const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text !== undefined) e.textContent = text; return e; };

    const kopf = el('div', 'font-weight:bold;cursor:pointer;color:#c8102e;',
      (zu ? '▸ ' : '▾ ') + '🔔 Fracht-Wächter v' + WAECHTER_VERSION + (CONFIG.TESTMODUS ? ' (TEST)' : ''));
    kopf.title = 'Ein-/ausklappen';
    kopf.onclick = () => { zu = !zu; zeichne(); };
    box.appendChild(kopf);
    const offen = offenesAngebot();
    if (offen) {
      const g = grundText(offen);
      box.appendChild(el('div', 'margin:2px 0;padding:3px 5px;border-radius:4px;background:' + (/✓|→ Sammel/.test(g) ? '#e8f5e9' : '#fff3e0') + ';color:#222;max-width:320px',
        'Dieses Angebot: ' + g));
    }
    if (zu) return;

    box.appendChild(el('div', '', state.status));
    box.appendChild(el('div', 'color:#666', 'Letzte Liste: ' + uhr + ' · ' + state.angebote + ' Angebote · gemeldet: ' + state.gemeldet +
      (einst.veralteteLoeschen ? ' · aus App entfernt: ' + state.entfernt : '')));
    const zz = (ks) => ks.map((k) => KANAELE[k].symbol + ' ' + (state.zaehler[k] || 0)).join(' ');
    box.appendChild(el('div', 'color:#666', 'Gemeldet: ' + zz(['heute', 'nacht', 'rund', 'fern', 'sonst']) + ' · Kanäle: ⚡ Heute laden / 📅 Ab morgen laden / 🔵 Preis abklären'));
    box.appendChild(el('div', 'color:#666', 'LKW: ' + (state.standort || '–') +
      (freiAbMs() > Date.now() ? ' · frei ab ' + uhrzeit(freiAbMs()) : '')));
    box.appendChild(el('div', rioAktuell() ? 'color:#2e7d32' : 'color:#c8102e',
      rioAktuell()
        ? 'RIO verbunden: ' + state.rio.lkw.map((l) => (l.name || l.kennzeichen || 'LKW')).join(', ') +
          ' (Stand ' + new Date(state.rio.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ')'
        : 'RIO nicht verbunden – Leer-km ab Startort der Suche'));
    box.appendChild(el('div', 'color:#666', 'Melden ab ' + einst.minDeckung + ' % (☀️/🌙 ' + einst.zusatzMinDeckung + ' %, 🔁 ' +
      einst.rundMinDeckung + ' %) von ' + zahl(einst.kostenProKm) + ' €/km + ' + einst.fixkostenProTag + ' €/Tag' +
      (einst.auslandAusschliessen ? ' · nur Firmen aus ' + erlaubt().join('/') : '') +
      (einst.nurDeutschland ? ' · nur Touren in DE' : '') + (einst.maxGewicht > 0 ? ' · bis ' + zahl(einst.maxGewicht, 1) + ' t' : '') +
      (Number(einst.knappAb) > 0 ? ' · 🤏 ab ' + einst.knappAb + ' % still mit Preisvorschlag' : '') +
      (Number(einst.maxLadestellen) > 0 || Number(einst.maxEntladestellen) > 0 ? ' · höchstens ' + (Number(einst.maxLadestellen) || '∞') + ' Lade-/' + (Number(einst.maxEntladestellen) || '∞') + ' Entladestellen' : '')));
    box.appendChild(el('div', 'color:#666', '🥇 ab ' + einst.goldAb + ' % · 🟢 ab ' + einst.gruenAb + ' % (Tagestour inkl. Heimfahrt ab ' + einst.tagestourGruenAb + ' %) · 🟡 ab ' + einst.gelbAb + ' % · 🔴 darunter · 🔵 Preis abklären (ohne Preis)'));
    Object.keys(state.auftraege || {}).map((k) => state.auftraege[k]).filter(aktivAuftrag).forEach((a) => {
      box.appendChild(el('div', 'color:#1f5fa8;font-weight:bold', '🔙 Rückweg-Suche ab ' + (a.ort || 'Entladeort') + (a.tour ? ' (' + a.tour + ')' : '') +
        ' · frei ab ' + wann(a.ende) + ' · ' + (a.letzte ? (a.richtung || 0) + ' Richtung ' + heimName() + ', ' + (a.gefunden || 0) + ' gemeldet · zuletzt ' + uhrzeit(a.letzte) : 'startet gleich') +
        (a.fehler ? ' · ⚠️ ' + a.fehler : '') + (imDienst() ? '' : ' · ruht außerhalb der Arbeitszeit')));
    });
    if (folgetourAktiv()) box.appendChild(el('div', 'color:#2e7d32;font-weight:bold', '✔ Folgetour-Modus: heute geladene Touren rechnen mit ' + einst.folgetourAnteil + ' % Tagessatz (' + euro(einst.fixkostenProTag * einst.folgetourAnteil / 100) + ') – bis Mitternacht'));
    if (Number(einst.aktivVon) !== Number(einst.aktivBis)) box.appendChild(el('div', imDienst() ? 'color:#666' : 'color:#c8102e', 'Arbeitszeit ' + einst.aktivVon + '–' + einst.aktivBis + ' Uhr' +
      (imDienst() ? ' · aktiv' : ' · Pause – um ' + einst.aktivVon + ' Uhr kommen die besten Angebote der Nacht')));
    if (einst.lkwRouting) { const oz = lade('orsZaehler', { tag: '', n: 0 }); box.appendChild(el('div', 'color:#666', '🚛 LKW-Routen heute: ' + (oz.tag === new Date().toDateString() ? oz.n : 0) + ' von ' + (Number(einst.orsProTag) || 180))); }
    if (sammelAktiv()) {
      const ps = lade('preisSammel', []), pz = lade('preisSammelZeit', 0);
      box.appendChild(el('div', 'color:#666', '🔵 Preis abklären: ' + ps.length + ' gesammelt · nächste Sammelmeldung ' +
        (ps.length ? 'ca. ' + new Date(Math.max(Date.now(), pz + Number(einst.preisSammelMin) * MIN)).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '– (nichts gesammelt)')));
    }
    if (appIstOffen()) box.appendChild(el('div', 'color:#2e7d32', '📱 Fracht-App ist auf dem Handy offen – ntfy-Meldungen kommen ohne Ton'));
    if (kanalTabs && !binLeiter) box.appendChild(el('div', 'color:#1f5fa8;font-weight:bold', '👁 Dieser Tab gibt seine Suchliste weiter – geprüft und gemeldet wird im anderen Timocom-Tab'));
    else if (aktiveListen().length > 1) box.appendChild(el('div', 'color:#1f5fa8;font-weight:bold', '🧠 Dieser Tab prüft ' + aktiveListen().length + ' Suchlisten (' + aktiveListen().map((k) => state.anzahl[k] || 0).join(' + ') + ' Angebote, auch aus anderen Tabs)'));
    if (state.listeVoll) box.appendChild(el('div', 'color:#555', state.listeVoll.sortiert
      ? '📋 Timocom zeigt nur ' + state.listeVoll.n + ' Angebote – Abgleich über die Sortierung, weggefallene Touren werden trotzdem gelöscht'
      : '📋 Timocom zeigt nur ' + state.listeVoll.n + ' Angebote – weggefallene Touren werden einzeln bei Timocom nachgeprüft'));
    if (!CONFIG.NTFY_KANAL) box.appendChild(el('div', 'color:#c8102e;font-weight:bold', '⚠️ Kein ntfy-Kanal eingetragen – es gehen keine Meldungen raus. Kanal und Token unter ⚙ Einstellungen eintragen, dann Tab neu laden.'));
    if (state.updateDa) {
      const upd = el('button', 'margin:6px 6px 0 0;padding:5px 10px;border:1px solid #2e7d32;border-radius:4px;cursor:pointer;font:bold 13px Arial,sans-serif;background:#2e7d32;color:#fff;', '⬆ Update auf ' + state.updateDa + ' installieren');
      upd.title = 'Öffnet das neue Skript – Tampermonkey fragt dann „Aktualisieren“. Danach Timocom-Tabs neu laden (F5).';
      upd.onclick = () => { window.open(UPDATE_SKRIPT, '_blank'); };
      box.appendChild(upd);
      box.appendChild(el('div', 'color:#2e7d32;font-weight:bold', 'Neue Version ' + state.updateDa + ' – nach dem Aktualisieren beide Timocom-Tabs mit F5 neu laden'));
    }
    if (tokenKaputt()) box.appendChild(el('div', 'color:#c8102e;font-weight:bold', '⚠️ ntfy-Token ungültig – Meldungen gehen ohne Abo raus. Neuen Token in ⚙ Einstellungen eintragen.'));
    box.appendChild(el('div', ntfyHeute() > ntfyReserve() ? 'color:#c8102e' : 'color:#666', '📨 ntfy-Nachrichten ' + (ntfyServerAktuell() ? 'heute: ' : 'letzte 24 Std.: ') + ntfyHeute() + ' von ' +
      zahl(ntfyLimit(), 0) + (ntfyServerAktuell() ? ' (laut ntfy' + (state.ntfyServer.reset ? ', neu ab ' + uhrzeit(state.ntfyServer.reset).slice(7) + ' Uhr' : '') + ')' : ' (geschätzt)') +
      (ntfyToken() ? ' · Abo' : ' · 🔵 als Sammelmeldung') + (ntfyHeute() > ntfyReserve() ? ' · Löschen pausiert' : '')));
    const abf = abfragenLetzteStunde();
    box.appendChild(el('div', abf >= maxAbfragen() ? 'color:#c8102e' : 'color:#666',
      'Eigene Abfragen letzte Stunde: ' + abf + ' von ' + maxAbfragen() +
      (abf >= maxAbfragen() ? ' – Pause, Meldungen kommen weiter (ohne Rückladung/Kontakt)' : '')));
    box.appendChild(el('div', 'color:#2e7d32', '✉ E-Mail über das Firmenprofil: aktiv' +
      (state.mailVersuche ? ' · gefunden bei ' + (state.mailGefunden || 0) + ' von ' + state.mailVersuche + ' Meldungen' : '')));
    mailQuelle = lade('mailQuelle', mailQuelle);
    if (false) box.appendChild(el('div', mailQuelle ? 'color:#2e7d32' : 'color:#666', mailQuelle
      ? '✉ E-Mail-Abruf gelernt ✔ (' + (mailQuelle.guete === 2 ? 'Ansprechpartner' : 'nur Firmen-E-Mail – im Firmenprofil die Nutzer öffnen, dann wird es der Ansprechpartner') + ') · ' +
        String(mailQuelle.vorlage).split('?')[0].slice(-45) + ' · ' + mailQuelle.feld
      : '✉ E-Mail-Abruf noch nicht gelernt: In Timocom ein Angebot öffnen, oben auf den Firmennamen klicken und im Firmenprofil die Nutzer öffnen' +
        ' (oder bei einem Angebot mit E-Mail die „Kontaktangaben“ aufklappen).' + (lade('mailHinweis', '') ? ' (' + lade('mailHinweis', '') + ')' : '')));
    if (state.protokoll.length) {
      const liste = el('div', 'margin-top:4px;border-top:1px solid #eee;padding-top:4px;color:#444;font-size:11px');
      state.protokoll.forEach((p) => liste.appendChild(el('div', '', p)));
      box.appendChild(liste);
    }

    const knopfCss = 'margin:6px 6px 0 0;padding:3px 8px;border:1px solid #c8102e;border-radius:4px;cursor:pointer;font:12px Arial,sans-serif;';
    const test = el('button', knopfCss + 'background:#c8102e;color:#fff;', 'Test-Push senden');
    test.onclick = () => {
      test.disabled = true;
      sende('Test vom Fracht-Wächter', 'Wenn du das auf dem Handy siehst, klappt alles.', 3, 'bell')
        .then((ok) => { setzeStatus(ok ? 'Test-Push gesendet ✔' : 'Test-Push fehlgeschlagen ✖'); });
    };
    box.appendChild(test);
    const topKnopf = el('button', knopfCss + 'background:#fff;color:#c8102e;', state.topLaeuft ? '⏳ läuft …' : '📤 Beste je Reiter senden');
    topKnopf.title = 'Schickt die besten Angebote der aktuellen Liste in jeden Reiter – auch schon bekannte.';
    topKnopf.disabled = state.topLaeuft;
    topKnopf.onclick = () => { sendeBeste(); zeichne(); };
    box.appendChild(topKnopf);
    if (!rioAktuell()) {
      const rioKnopf = el('button', knopfCss + 'background:#fff;color:#c8102e;', '📍 RIO öffnen');
      rioKnopf.title = 'Öffnet den RIO Live Monitor in einem neuen Tab. Den Tab offen lassen – von dort kommen die LKW-Positionen.';
      rioKnopf.onclick = () => { window.open('https://livemonitor.rio.cloud/', 'mzw_rio'); };
      box.appendChild(rioKnopf);
    }
    const folgeKnopf = el('button', knopfCss + (folgetourAktiv() ? 'background:#2e7d32;color:#fff;border-color:#2e7d32;' : 'background:#fff;color:#c8102e;'),
      folgetourAktiv() ? '✔ Folgetour-Modus an (heute)' : '✔ Heute schon Tour gefahren');
    folgeKnopf.title = 'Heute wurde schon eine Tour gefahren: heute geladene Touren rechnen nur noch mit ' + einst.folgetourAnteil + ' % Tagessatz. Gilt bis Mitternacht. Nochmal klicken = aus.';
    folgeKnopf.onclick = () => {
      speichere('folgetourTag', folgetourAktiv() ? '' : new Date().toDateString());
      state.rueckCache = {};
      setzeStatus(folgetourAktiv() ? 'Folgetour-Modus an: heute geladene Touren mit ' + einst.folgetourAnteil + ' % Tagessatz (bis Mitternacht)' : 'Folgetour-Modus aus');
    };
    box.appendChild(folgeKnopf);
    const diagKnopf = el('button', knopfCss + 'background:#fff;color:#c8102e;', '🔍 Diagnose senden');
    diagKnopf.title = 'Schickt den Aufbau der zuletzt gesehenen Timocom-Daten (ohne Namen, E-Mails, Telefonnummern) zur Fehlersuche.';
    diagKnopf.onclick = () => { Promise.all([diagnoseSenden().catch(() => false), probeSenden('knopf')]).then(([a, b]) => setzeStatus(a || b ? 'Diagnose gesendet ✔' : 'Diagnose fehlgeschlagen ✖')); };
    box.appendChild(diagKnopf);
    const knopfEinst = el('button', knopfCss + 'background:#fff;color:#c8102e;', einstOffen ? 'Einstellungen zu' : '⚙ Einstellungen');
    knopfEinst.onclick = () => { einstOffen = !einstOffen; zeichne(); };
    box.appendChild(knopfEinst);

    if (einstOffen) {
      const form = el('div', 'margin-top:6px;border-top:1px solid #eee;padding-top:6px;');
      const eingaben = {};
      FELDER.forEach(([key, label, typ, schritt]) => {
        const zeile = el('label', 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin:2px 0;');
        zeile.appendChild(el('span', '', label));
        const inp = document.createElement(typ === 'textarea' ? 'textarea' : 'input');
        if (typ !== 'textarea') inp.type = typ;
        if (typ === 'checkbox') inp.checked = !!einst[key];
        else {
          inp.value = einst[key] == null ? '' : einst[key];
          inp.style.width = typ === 'datetime-local' || typ === 'text' || typ === 'textarea' ? '170px' : '70px';
          if (typ === 'textarea') { inp.rows = 7; inp.style.font = '11px Arial,sans-serif'; }
        }
        if (schritt) inp.step = schritt;
        eingaben[key] = inp;
        zeile.appendChild(inp);
        form.appendChild(zeile);
      });
      const speichernKnopf = el('button', knopfCss + 'background:#c8102e;color:#fff;', 'Speichern');
      speichernKnopf.onclick = () => {
        FELDER.forEach(([key, , typ]) => {
          const inp = eingaben[key];
          if (typ === 'checkbox') einst[key] = inp.checked;
          else if (typ === 'number') { const v = parseFloat(String(inp.value).replace(',', '.')); if (!isNaN(v)) einst[key] = v; }
          else einst[key] = inp.value;
        });
        speichere('einst', einst);
        state.rueckCache = {};
        einstOffen = false;
        setzeStatus('Einstellungen gespeichert ✔');
      };
      const zurueck = el('button', knopfCss + 'background:#fff;color:#666;border-color:#999;', 'Standard');
      zurueck.onclick = () => { einst = Object.assign({}, STANDARD); speichere('einst', einst); zeichne(); };
      form.appendChild(speichernKnopf);
      form.appendChild(zurueck);
      box.appendChild(form);
    }
  }

  document.addEventListener('DOMContentLoaded', zeichne);
  if (location.pathname.indexOf('/tcprofile/') !== -1) {
    window.addEventListener('load', () => setTimeout(() => { profilLernen().catch(() => { /* egal */ }); }, 2500));
  }
  // Ist die Fracht-App gerade offen? (jede Minute nachsehen)
  setTimeout(() => { appStatus(); }, 4000);
  setInterval(() => { appStatus(); }, 60 * 1000);
  setInterval(() => { rueckwegRunde().catch((e) => console.warn('[Fracht-Wächter]', e)); }, 60 * 1000);
  setTimeout(() => { rueckwegRunde().catch(() => { /* egal */ }); }, 20 * 1000);
  setTimeout(() => { ntfyAbgleich(); }, 20 * 1000);
  setInterval(() => { ntfyAbgleich(); }, 10 * 60 * 1000);
  // Stand bei ntfy alle 10 Minuten abfragen
  setTimeout(() => { ntfyStandHolen(); }, 5000);
  setInterval(() => { ntfyStandHolen(); }, 10 * MIN);
  // Sammelmeldung „🔵 Preis abklären“ regelmäßig verschicken
  setInterval(() => { try { sammelSenden(false); } catch (e) { /* egal */ } }, MIN);
  // Kasten sicher anzeigen, auch wenn Timocom ihn beim Seitenaufbau entfernt
  setInterval(() => { if (document.body && (!box || !box.isConnected)) zeichne(); }, 3000);
  let letztesOffen = null;
  setInterval(() => { const o = offenesAngebot(); if (o !== letztesOffen) { letztesOffen = o; zeichne(); } }, 1000);
  if (CONFIG.TESTMODUS) {
    window.__mzw = { verarbeite, bewerte, rueckladung, formatiere, pruefeUndMelde, auslandLand, state, einst: () => einst, auth: () => !!authToken };
  }
})();
