// ==UserScript==
// @name         Le Dôme De La Paix - Fourmizzz S5 (Ressources, Armee & Commerce)
// @namespace    https://s5.fourmizzz.fr/
// @version      0.5.44-worker
// @updateURL    https://raw.githubusercontent.com/LDDLP/applizze-script/main/fourmizzz.user.js
// @downloadURL  https://raw.githubusercontent.com/LDDLP/applizze-script/main/fourmizzz.user.js
// @description  Outils d'alliance centralisés sur S5 : chasses en tête du Dôme avec TDC + chassé, attaques compactes avec filtres et tri, TDC attaquant/cible, règle 50%-300% / 20% max et convois.
// @match        *://s5.fourmizzz.fr/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      applizze-worker.devreuxbenoit571.workers.dev
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  "use strict";

  const HOST = window.location.hostname.toLowerCase();
  if (HOST !== "s5.fourmizzz.fr") return;

  const SCRIPT_VERSION = "0.5.44-worker";

  const PATH = window.location.pathname.toLowerCase();
  const HREF = window.location.href.toLowerCase();
  const SEARCH = window.location.search.toLowerCase();
  const IS_RESSOURCES = PATH.includes("ressources.php");
  const IS_ACQUERIR_TERRAIN = PATH.includes("acquerirterrain.php");
  const IS_HUNT_PAGE = IS_RESSOURCES || IS_ACQUERIR_TERRAIN;
  const IS_ARMEE = PATH.includes("armee.php");
  const IS_ENNEMIE = PATH.includes("ennemie.php");
  const IS_ATTACK_PAGE = IS_ARMEE || IS_ENNEMIE;
  const IS_COMMERCE = PATH.includes("commerce.php");

  const OWN_ALLIANCE_TAG = "LDDLP";

  const SHORTCUT_LINKS = {
    discordUrl: "https://discord.com/app",
    siteUrl: "https://applizzz.pages.dev/",
    membersUrl: "https://s5.fourmizzz.fr/alliance.php?Membres",
    scriptUpdateUrl: "https://raw.githubusercontent.com/LDDLP/applizze-script/main/fourmizzz.user.js"
  };

  const STORAGE_KEYS = {
    hunts: "fmz_local_hunts_v1",
    huntHistory: "fmz_local_hunt_history_v1",
    huntBenchmarks: "fmz_local_hunt_benchmarks_v1",
    attacks: "fmz_local_attacks_v1",
    movements: "fmz_local_movements_v1",
    convoyRequests: "fmz_local_convoy_requests_v1",
    convoyLog: "fmz_local_convoy_log_v1",
    pendingCommerceFill: "fmz_pending_commerce_fill_v1",
    pendingConvoyMatch: "fmz_pending_convoy_match_v1",
    devUser: "fmz_local_dev_user_v1",
    allianceTdc: "fmz_alliance_tdc_v1",
    allianceStats: "fmz_alliance_stats_v1",
    authToken: "fmz_local_auth_token_v1",
    workerPass: "fmz_local_worker_pass_v1",
    bubbleOpen: "fmz_global_bubble_open_v1",
    convoyBubbleOpen: "fmz_convoy_bubble_open_v1",
    allianceBubbleOpen: "fmz_alliance_bubble_open_v1",
    statsBubbleOpen: "fmz_stats_bubble_open_v1",
    playersBubbleOpen: "fmz_players_bubble_open_v1",
    bubbleSections: "fmz_global_bubble_sections_v1",
    remoteVersionCache: "fmz_remote_version_cache_v1"
  };

  const DEFAULT_DEV_USER = "DEADKAT";

  const WORKER_CONFIG = {
    enabled: true,
    endpoint: "https://applizze-worker.devreuxbenoit571.workers.dev",
    auth: {
      mode: "member",
      pseudo: "",
      password: "",
      autoRegister: true
    }
  };

  const UNIT_STATS = {
    "jeune soldate naine": { life: 8, atk: 3, def: 2 },
    "soldate naine": { life: 10, atk: 5, def: 4 },
    "naine d'élite": { life: 13, atk: 7, def: 6 },
    "jeune soldate": { life: 16, atk: 10, def: 9 },
    "soldate": { life: 20, atk: 15, def: 14 },
    "concierge": { life: 30, atk: 1, def: 25 },
    "artilleuse": { life: 10, atk: 30, def: 15 },
    "artilleuse d'élite": { life: 12, atk: 35, def: 18 },
    "soldate d'élite": { life: 27, atk: 24, def: 23 },
    "tank": { life: 35, atk: 55, def: 1 },
    "tueuse": { life: 50, atk: 50, def: 50 },
    "tueuse d'élite": { life: 55, atk: 55, def: 55 }
  };

  const PREDATOR_STATS = [
    { name: "Petite araignée", atk: 13, life: 50, food: 18.5 },
    { name: "Araignée", atk: 19, life: 75, food: 27.4 },
    { name: "Chenille", atk: 30, life: 100, food: 39.8 },
    { name: "Criquet", atk: 42, life: 100, food: 47.1 },
    { name: "Guèpe", atk: 50, life: 140, food: 60.8 },
    { name: "Cigale", atk: 70, life: 200, food: 86 },
    { name: "Abeille", atk: 115, life: 220, food: 115.7 },
    { name: "Dionée", atk: 70, life: 700, food: 161 },
    { name: "Hanneton", atk: 140, life: 450, food: 182.6 },
    { name: "Scarabée", atk: 230, life: 1000, food: 348.8 },
    { name: "Mante religieuse", atk: 1200, life: 800, food: 712.6 },
    { name: "Lezard", atk: 700, life: 5000, food: 1361 },
    { name: "Souris", atk: 1400, life: 5000, food: 1924 },
    { name: "Mulot", atk: 3000, life: 8000, food: 3563 },
    { name: "Alouette", atk: 10000, life: 30000, food: 12597 },
    { name: "Rat", atk: 50000, life: 100000, food: 51426 },
    { name: "Tamanoir", atk: 1000000, life: 5000000, food: 1626231 }
  ];

  let promptedThisLoad = false;
  let cachedWorkerToken = "";
  let loginPromise = null;

  const lastSentSig = {};
  let nextRetryAt = 0;
  const RETRY_DELAY_MS = 60 * 1000;
  let lastSyncUpdatedAt = 0;
  let syncStatus = { state: "idle", label: "Prêt", at: 0 };
  let allianceAttackFilter = "all";
  let allianceAttackSort = "time";
  let selectedPlayerKey = "";
  let updateAvailableInfo = { available: false, remoteVersion: "" };

  let lastLeftDockSig = "";
  let lastRootSig = "";

  const DEFAULT_PLAYERS = [
    { name: "Peps", x: 80, y: 52, va: 0 },
    { name: "Blue59", x: 27, y: 41, va: 0 },
    { name: "Legrotteuh", x: 30, y: 43, va: 0 },
    { name: "Silas88", x: 2, y: 47, va: 0 },
    { name: "GrenouilleQc101", x: 95, y: 40, va: 0 },
    { name: "Hydci", x: 37, y: 41, va: 0 },
    { name: "Scrimey", x: 0, y: 54, va: 0 },
    { name: "Roiscorpion", x: 93, y: 39, va: 0 },
    { name: "Mick", x: 2, y: 77, va: 0 },
    { name: "Belphegor", x: 48, y: 56, va: 0 },
    { name: "Eldindon", x: 98, y: 48, va: 0 },
    { name: "Disco", x: 17, y: 80, va: 0 },
    { name: "Halfou", x: 15, y: 79, va: 0 },
    { name: "spartiate61", x: 95, y: 45, va: 0 },
    { name: "DEADKAT", x: 35, y: 81, va: 0 },
    { name: "Nyfarix", x: 77, y: 84, va: 0 },
    { name: "Atiraya", x: 68, y: 82, va: 0 },
    { name: "Ange", x: 25, y: 79, va: 0 },
    { name: "Hantiz", x: 84, y: 78, va: 0 },
    { name: "Arktik22", x: 68, y: 1, va: 0 },
    { name: "gireg", x: 90, y: 40, va: 0 }
  ];

  const LDDLP_KEYS = new Set(DEFAULT_PLAYERS.map((p) => normalizePseudo(p.name)));

  function compareScriptVersions(localVer, remoteVer) {
    const parse = (v) => {
      const clean = String(v || "").trim().replace(/^v/i, "");
      const [numPart, suffix = ""] = clean.split("-");
      const nums = numPart.split(".").map((n) => parseInt(n, 10) || 0);
      return { nums, suffix: suffix.toLowerCase() };
    };
    const a = parse(localVer);
    const b = parse(remoteVer);
    const len = Math.max(a.nums.length, b.nums.length);
    for (let i = 0; i < len; i++) {
      const av = a.nums[i] || 0;
      const bv = b.nums[i] || 0;
      if (bv > av) return 1;
      if (bv < av) return -1;
    }
    if (a.suffix !== b.suffix && b.suffix) return 1;
    return 0;
  }

  function httpTextGet(url) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: { "Cache-Control": "no-cache" },
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              resolve({ ok: true, text: res.responseText || "" });
            } else {
              resolve({ ok: false, status: res.status });
            }
          },
          onerror: () => resolve({ ok: false })
        });
      });
    }
    return fetch(url, { cache: "no-store" })
      .then(async (res) => (res.ok ? { ok: true, text: await res.text() } : { ok: false, status: res.status }))
      .catch(() => ({ ok: false }));
  }

  async function checkScriptUpdate(force = false) {
    const now = Date.now();
    try {
      const rawCache = localStorage.getItem(STORAGE_KEYS.remoteVersionCache);
      if (!force && rawCache) {
        const cached = JSON.parse(rawCache);
        if (cached && cached.checkedAt && now - cached.checkedAt < 10 * 60 * 1000 && cached.remoteVersion) {
          const isNewer = compareScriptVersions(SCRIPT_VERSION, cached.remoteVersion) > 0;
          updateAvailableInfo = { available: isNewer, remoteVersion: cached.remoteVersion };
          return updateAvailableInfo;
        }
      }
    } catch (e) {}

    const url = `${SHORTCUT_LINKS.scriptUpdateUrl}?t=${now}`;
    const res = await httpTextGet(url);
    if (!res.ok || !res.text) return updateAvailableInfo;

    const m = res.text.match(/@version\s+([^\r\n]+)/i);
    if (!m) return updateAvailableInfo;

    const remoteVersion = m[1].trim();
    const isNewer = compareScriptVersions(SCRIPT_VERSION, remoteVersion) > 0;
    updateAvailableInfo = { available: isNewer, remoteVersion };

    try {
      localStorage.setItem(
        STORAGE_KEYS.remoteVersionCache,
        JSON.stringify({ remoteVersion, checkedAt: now })
      );
    } catch (e) {}

    renderGlobalBubble();
    return updateAvailableInfo;
  }

  function isSessionLocked() {
    return syncStatus.state === "ok" || !!getStoredToken();
  }

  function setSyncState(state, label) {
    syncStatus = { state, label, at: Date.now() };
    if (isSessionLocked()) {
      accountDrawerOpen = false;
    }
  }

  function getDevUser() {
    try {
      const val = localStorage.getItem(STORAGE_KEYS.devUser);
      return val && val.trim() ? val.trim() : DEFAULT_DEV_USER;
    } catch (e) {
      return DEFAULT_DEV_USER;
    }
  }

  function hasStoredDevUser() {
    try {
      const val = localStorage.getItem(STORAGE_KEYS.devUser);
      return !!(val && val.trim());
    } catch (e) {
      return false;
    }
  }

  function setDevUser(name) {
    if (isSessionLocked()) return getDevUser();
    const clean = String(name || "").trim() || DEFAULT_DEV_USER;
    const changed = normalizePseudo(getDevUser()) !== normalizePseudo(clean);
    try {
      localStorage.setItem(STORAGE_KEYS.devUser, clean);
    } catch (e) {}
    if (changed) {
      setStoredToken("");
      setStoredPassword("");
      promptedThisLoad = false;
      Object.keys(lastSentSig).forEach((k) => delete lastSentSig[k]);
      lastSyncUpdatedAt = 0;
      nextRetryAt = 0;
    }
    return clean;
  }

  function readAllianceTdcMap() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.allianceTdc);
      const parsed = JSON.parse(raw || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeAllianceTdcMap(mapObj) {
    try {
      localStorage.setItem(STORAGE_KEYS.allianceTdc, JSON.stringify(mapObj));
    } catch (e) {}
  }

  function readAllianceStats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.allianceStats);
      const parsed = JSON.parse(raw || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function writeAllianceStats(statsObj) {
    try {
      if (statsObj && typeof statsObj === "object") {
        localStorage.setItem(STORAGE_KEYS.allianceStats, JSON.stringify(statsObj));
      }
    } catch (e) {}
  }

  function computeAndStoreAllianceStatsFromMap(mapObj, now = Date.now()) {
    const list = Object.entries(mapObj || {})
      .filter(
        ([k, v]) =>
          k &&
          !k.startsWith("_") &&
          LDDLP_KEYS.has(normalizePseudo(k)) &&
          v &&
          typeof v.tdc === "number" &&
          v.tdc > 0
      )
      .map(([, v]) => ({
        name: playerDisplayName(v.pseudo),
        tdc: Math.floor(v.tdc)
      }))
      .sort((a, b) => b.tdc - a.tdc);

    if (!list.length) return null;

    const totalTdc = list.reduce((sum, p) => sum + p.tdc, 0);
    const avgTdc = Math.round(totalTdc / list.length);
    const statsPayload = {
      alliance: OWN_ALLIANCE_TAG,
      memberCount: list.length,
      totalTdc,
      avgTdc,
      topPlayers: list,
      updatedAt: now
    };
    writeAllianceStats(statsPayload);
    return statsPayload;
  }

  function ingestRemoteStats(rawStats) {
    if (!rawStats || typeof rawStats !== "object") return;
    const filteredTop = Array.isArray(rawStats.topPlayers)
      ? rawStats.topPlayers.filter((p) => p && isKnownAllianceMemberName(p.name || p.pseudo || p.player))
      : undefined;
    const normalized = {
      ...rawStats,
      ...(filteredTop !== undefined ? { topPlayers: filteredTop } : {}),
      updatedAt: Number(rawStats.updatedAt) || Date.now()
    };
    writeAllianceStats(normalized);
  }

  function isKnownAllianceMemberName(pseudo) {
    const norm = normalizePseudo(pseudo);
    if (!norm) return false;
    return LDDLP_KEYS.has(norm);
  }

  function cleanAllianceTdcMap() {
    const map = readAllianceTdcMap();
    const cleaned = {};
    let changed = false;

    for (const [k, v] of Object.entries(map)) {
      if (k === "_lastScanAt") {
        cleaned[k] = v;
        continue;
      }
      if (!v || typeof v !== "object") {
        changed = true;
        continue;
      }
      const pseudo = String(v.pseudo || k).trim();
      const norm = normalizePseudo(pseudo);
      if (isKnownAllianceMemberName(pseudo) && Number(v.tdc) > 0) {
        cleaned[norm] = { ...v, pseudo, tdc: Math.floor(Number(v.tdc)) };
      } else {
        changed = true;
      }
    }

    if (changed) {
      writeAllianceTdcMap(cleaned);
    }
    return cleaned;
  }

  function ingestRemotePlayersTdc(remotePlayers) {
    if (!Array.isArray(remotePlayers) || !remotePlayers.length) return;
    const map = readAllianceTdcMap();
    const now = Date.now();
    let updated = false;

    for (const p of remotePlayers) {
      if (!p || typeof p !== "object") continue;
      const name = String(p.name || p.pseudo || p.player || "").trim();
      if (!isCleanPlayerName(name) || !isKnownAllianceMemberName(name)) continue;
      const norm = normalizePseudo(name);
      const rawTdc = p.tdc ?? p.terrain ?? p.area ?? 0;
      const num = parseLeadingFrNumber(rawTdc);
      if (!norm || !Number.isFinite(num) || num <= 0) continue;
      if (!map[norm] || map[norm].source !== "alliance_page") {
        map[norm] = {
          pseudo: name,
          tdc: Math.floor(num),
          alliance: OWN_ALLIANCE_TAG,
          source: "worker",
          updatedAt: now
        };
        updated = true;
      }
    }

    if (updated) {
      writeAllianceTdcMap(map);
      computeAndStoreAllianceStatsFromMap(map, now);
    }
  }

  function getPlayerTdc(pseudo) {
    const norm = normalizePseudo(pseudo);
    if (!norm || !LDDLP_KEYS.has(norm)) return null;
    const map = readAllianceTdcMap();
    const entry = map[norm];
    if (entry && typeof entry.tdc === "number" && entry.tdc > 0) {
      return Math.floor(entry.tdc);
    }
    const fallback = DEFAULT_PLAYERS.find((p) => normalizePseudo(p.name) === norm);
    if (fallback && typeof fallback.tdc === "number" && fallback.tdc > 0) {
      return Math.floor(fallback.tdc);
    }
    return null;
  }

  function getHuntTdcSummary(huntItem) {
    const chain = getHuntTdcChain().get(String((huntItem && (huntItem.sig || huntItem.id)) || ""));
    if (chain && chain.before > 0) {
      return {
        hasTdc: true,
        beforeTdc: chain.before,
        afterTdc: chain.after,
        gainedTdc: chain.gain
      };
    }
    const playerPseudo = (huntItem && huntItem.player) || getDevUser();
    const baseTdc = getPlayerTdc(playerPseudo);
    if (!baseTdc || baseTdc <= 0) {
      return { hasTdc: false, beforeTdc: null, afterTdc: null, gainedTdc: 0 };
    }
    const gainedTdc = Math.max(0, Number(huntItem && huntItem.area) || 0);
    const afterTdc = baseTdc + gainedTdc;
    return {
      hasTdc: true,
      beforeTdc: baseTdc,
      afterTdc,
      gainedTdc
    };
  }

  function estimateHuntDurationSec(areaVal) {
    const cleanArea = Math.max(0, Number(areaVal) || 0);
    if (cleanArea <= 0) return 0;

    const benchmarks = readJsonArray(STORAGE_KEYS.huntBenchmarks);
    const validBench = benchmarks.filter((b) => b && Number(b.area) > 0 && Number(b.durationSec) > 0);
    if (validBench.length > 0) {
      const nearest = validBench
        .slice()
        .sort((a, b) => Math.abs(Number(a.area) - cleanArea) - Math.abs(Number(b.area) - cleanArea))[0];
      return Math.max(60, Math.round((cleanArea / Number(nearest.area)) * Number(nearest.durationSec)));
    }

    const history = readJsonArray(STORAGE_KEYS.huntHistory).filter(
      (h) => h && Number(h.area) > 0 && Number(h.firstSeenAt || h.detectedAt) > 0 && Number(h.finishedAt || h.arrivalAt) > 0
    );
    if (history.length > 0) {
      const h0 = history[0];
      const dur0 = Math.max(60, Math.round((Number(h0.finishedAt || h0.arrivalAt) - Number(h0.firstSeenAt || h0.detectedAt)) / 1000));
      return Math.max(60, Math.round((cleanArea / Number(h0.area)) * dur0));
    }

    return Math.round(82000 + cleanArea * 4.5);
  }

  function simulateHuntCombat({ jsnCount = 100000, weaponLvl = 0, shieldLvl = 0, enemies = [] }) {
    const atkMult = 1 + 0.1 * Math.max(0, Number(weaponLvl) || 0);
    const shieldMult = 1 + 0.1 * Math.max(0, Number(shieldLvl) || 0);
    const baseLifePerJsn = UNIT_STATS["jeune soldate naine"].life;
    const baseAtkPerJsn = UNIT_STATS["jeune soldate naine"].atk;

    let aliveJsn = Math.max(0, Math.floor(Number(jsnCount) || 0));
    const activeEnemies = (enemies || []).map((e) => ({
      name: e.name,
      count: Math.max(0, Math.floor(Number(e.count) || 0)),
      hpEach: Number(e.life) || 50,
      atkEach: Number(e.atk) || 13,
      foodEach: Number(e.food) || 0
    }));

    let totalHpPool = activeEnemies.reduce((s, e) => s + e.count * e.hpEach, 0);
    let deadJsnTotal = 0;
    let rounds = 0;
    let foodGained = 0;

    while (aliveJsn > 0 && totalHpPool > 0 && rounds < 25) {
      rounds++;
      const dmgDealt = Math.floor(aliveJsn * baseAtkPerJsn * atkMult);
      const enemiesBefore = activeEnemies.reduce((s, e) => s + e.count, 0);
      const hpBeforeRound = Math.max(1, totalHpPool);
      totalHpPool = Math.max(0, totalHpPool - dmgDealt);

      const enemiesAfter = enemiesBefore > 0
        ? Math.max(0, Math.floor(enemiesBefore * (totalHpPool / hpBeforeRound)))
        : 0;

      const killedThisRound = Math.max(0, enemiesBefore - enemiesAfter);
      if (activeEnemies.length > 0 && killedThisRound > 0) {
        const share = killedThisRound / Math.max(1, enemiesBefore);
        activeEnemies.forEach((e) => {
          const k = Math.min(e.count, Math.round(e.count * share));
          e.count -= k;
          foodGained += k * e.foodEach;
        });
      }

      const rawEnemyDmg = activeEnemies.reduce((s, e) => s + e.count * e.atkEach, 0);
      const effectiveLifePerJsn = baseLifePerJsn * shieldMult;
      const deathsThisRound = Math.min(aliveJsn, Math.floor(rawEnemyDmg / effectiveLifePerJsn));

      aliveJsn -= deathsThisRound;
      deadJsnTotal += deathsThisRound;
    }

    return {
      won: aliveJsn > 0 && totalHpPool <= 0,
      rounds,
      aliveJsn,
      deadJsn: deadJsnTotal,
      foodGained: Math.round(foodGained)
    };
  }

  function getAttackSentAnts(attackItem) {
    if (!attackItem || typeof attackItem !== "object") return 0;
    const direct = Number(attackItem.ants) || 0;
    if (direct > 0) return Math.floor(direct);

    if (Array.isArray(attackItem.troops) && attackItem.troops.length) {
      const fromTroops = attackItem.troops.reduce(
        (sum, t) => sum + (Number(t && t.quantity) || 0),
        0
      );
      if (fromTroops > 0) return Math.floor(fromTroops);
    }

    const fallbackText = String(attackItem.rawText || attackItem.arrivalLabel || "");
    const m = fallbackText.match(/([\d\s\u00a0.,]+)\s+fourmis?\b/i);
    if (m) {
      return Math.floor(parseFrInt(m[1]) || 0);
    }
    return 0;
  }

  function simulateTimeline(nowMs = Date.now(), extraHunts = []) {
    const running = new Map();
    const getRun = (pseudo) => {
      const k = normalizePseudo(pseudo);
      if (!k) return null;
      if (!running.has(k)) running.set(k, getPlayerTdc(pseudo));
      return running.get(k);
    };

    const events = [];
    const seen = new Set();

    getAllAllianceAttacks(nowMs).forEach((a) =>
      events.push({ kind: "attack", at: Number(a.arrivalAt || 0), item: a })
    );

    getAllActiveHunts(nowMs).concat(extraHunts || []).forEach((h) => {
      const k = String(h.sig || h.id);
      if (seen.has(k)) return;
      seen.add(k);
      events.push({ kind: "hunt", at: Number(h.arrivalAt || 0), item: h });
    });

    events.sort((x, y) => x.at - y.at);

    const attacks = new Map();
    const hunts = new Map();

    for (const ev of events) {
      if (ev.kind === "attack") {
        const a = ev.item;
        const ants = Math.max(0, getAttackSentAnts(a));
        const tBefore = getRun(a.target);
        const aBefore = getRun(a.attacker);

        let willFail = false;
        let failReason = "";
        let ratioPct = null;

        if (tBefore != null && tBefore > 0 && aBefore != null && aBefore > 0) {
          ratioPct = Math.round((tBefore / aBefore) * 100);
          if (tBefore < aBefore * 0.5) {
            willFail = true;
            failReason = `cible trop petite (${ratioPct}% < 50%)`;
          } else if (tBefore > aBefore * 3) {
            willFail = true;
            failReason = `cible trop grande (${ratioPct}% > 300%)`;
          }
        }

        const maxSteal20 = tBefore != null && tBefore > 0 ? Math.floor(tBefore * 0.2) : null;
        let taken = 0;
        if (!willFail && tBefore != null && tBefore > 0) {
          if (ants > 0) {
            taken = Math.min(ants, maxSteal20);
          } else {
            taken = maxSteal20;
          }
        }

        const tAfter = tBefore != null ? Math.max(0, tBefore - taken) : null;
        const aAfter = aBefore != null ? aBefore + taken : null;

        if (tBefore != null) running.set(normalizePseudo(a.target), tAfter);
        if (aBefore != null) running.set(normalizePseudo(a.attacker), aAfter);

        attacks.set(String(a.sig || a.id), {
          item: a,
          ants,
          taken,
          maxSteal20,
          willFail,
          failReason,
          ratioPct,
          target: { before: tBefore, after: tAfter },
          attacker: { before: aBefore, after: aAfter }
        });
      } else {
        const h = ev.item;
        const gain = Math.max(0, Number(h.area) || 0);
        const before = getRun(h.player);
        const after = before != null ? before + gain : null;
        if (before != null) running.set(normalizePseudo(h.player), after);
        hunts.set(String(h.sig || h.id), { item: h, gain, before, after });
      }
    }

    return { at: nowMs, attacks, hunts, finalTdc: running };
  }

  let tdcChainCache = { at: 0, attacks: new Map(), hunts: new Map(), finalTdc: new Map() };

  function getTdcChains() {
    const nowMs = Date.now();
    if (nowMs - tdcChainCache.at < 500) return tdcChainCache;
    tdcChainCache = simulateTimeline(nowMs);
    return tdcChainCache;
  }

  function getAttackTdcChain() {
    return getTdcChains().attacks;
  }

  function getHuntTdcChain() {
    return getTdcChains().hunts;
  }

  function getAttackEvaluation(attackItem) {
    const chain = getAttackTdcChain().get(String((attackItem && (attackItem.sig || attackItem.id)) || ""));
    if (chain) return chain;
    const tBefore = getPlayerTdc(attackItem && attackItem.target);
    const aBefore = getPlayerTdc(attackItem && attackItem.attacker);
    const ants = Math.max(0, getAttackSentAnts(attackItem));
    let willFail = false;
    let failReason = "";
    let ratioPct = null;
    if (tBefore && aBefore) {
      ratioPct = Math.round((tBefore / aBefore) * 100);
      if (tBefore < aBefore * 0.5) {
        willFail = true;
        failReason = `cible trop petite (${ratioPct}% < 50%)`;
      } else if (tBefore > aBefore * 3) {
        willFail = true;
        failReason = `cible trop grande (${ratioPct}% > 300%)`;
      }
    }
    const maxSteal20 = tBefore ? Math.floor(tBefore * 0.2) : null;
    const taken = willFail || !tBefore ? 0 : (ants > 0 ? Math.min(ants, maxSteal20) : maxSteal20);
    return {
      item: attackItem,
      ants,
      taken,
      maxSteal20,
      willFail,
      failReason,
      ratioPct,
      target: { before: tBefore, after: tBefore != null ? Math.max(0, tBefore - taken) : null },
      attacker: { before: aBefore, after: aBefore != null ? aBefore + taken : null }
    };
  }

  function getAttackTdcSummary(attackItem) {
    const ev = getAttackEvaluation(attackItem);
    const baseTdc = ev.target.before;
    if (!baseTdc || baseTdc <= 0) {
      return {
        hasTdc: false,
        hasAnts: ev.ants > 0,
        beforeTdc: null,
        afterTdc: null,
        sentAnts: ev.ants,
        taken: 0,
        maxSteal20: null,
        willFail: false,
        failReason: "",
        ratioPct: ev.ratioPct
      };
    }
    return {
      hasTdc: true,
      hasAnts: ev.ants > 0,
      beforeTdc: baseTdc,
      afterTdc: ev.target.after,
      sentAnts: ev.ants,
      taken: ev.taken,
      maxSteal20: ev.maxSteal20,
      willFail: ev.willFail,
      failReason: ev.failReason,
      ratioPct: ev.ratioPct
    };
  }

  function getAttackerTdcSummary(attackItem) {
    const ev = getAttackEvaluation(attackItem);
    const baseTdc = ev.attacker.before;
    if (!baseTdc || baseTdc <= 0) {
      return {
        hasTdc: false,
        hasAnts: ev.ants > 0,
        beforeTdc: null,
        afterTdc: null,
        sentAnts: ev.ants,
        taken: 0,
        willFail: false,
        failReason: "",
        ratioPct: ev.ratioPct
      };
    }
    return {
      hasTdc: true,
      hasAnts: ev.ants > 0,
      beforeTdc: baseTdc,
      afterTdc: ev.attacker.after,
      sentAnts: ev.ants,
      taken: ev.taken,
      willFail: ev.willFail,
      failReason: ev.failReason,
      ratioPct: ev.ratioPct
    };
  }

  function resetAccountSession(newPseudo = "") {
    setStoredToken("");
    setStoredPassword("");
    promptedThisLoad = false;
    Object.keys(lastSentSig).forEach((k) => delete lastSentSig[k]);
    lastSyncUpdatedAt = 0;
    nextRetryAt = 0;
    if (newPseudo && String(newPseudo).trim()) {
      try {
        localStorage.setItem(STORAGE_KEYS.devUser, String(newPseudo).trim());
      } catch (e) {}
    }
    setSyncState("idle", "Déconnecté");
  }

  function getStoredPassword() {
    try {
      const ls = localStorage.getItem(STORAGE_KEYS.workerPass);
      if (ls && ls.trim()) return ls.trim();
    } catch (e) {}
    try {
      if (typeof GM_getValue === "function") {
        const gm = GM_getValue(STORAGE_KEYS.workerPass, "");
        if (typeof gm === "string" && gm.trim()) {
          try {
            localStorage.setItem(STORAGE_KEYS.workerPass, gm.trim());
          } catch (e) {}
          return gm.trim();
        }
      }
    } catch (e) {}
    return "";
  }

  function setStoredPassword(pw) {
    const clean = String(pw || "").trim();
    try {
      if (clean) localStorage.setItem(STORAGE_KEYS.workerPass, clean);
      else localStorage.removeItem(STORAGE_KEYS.workerPass);
    } catch (e) {}
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(STORAGE_KEYS.workerPass, clean);
      }
    } catch (e) {}
    return clean;
  }

  function getStoredToken() {
    if (cachedWorkerToken) return cachedWorkerToken;
    try {
      const val = (localStorage.getItem(STORAGE_KEYS.authToken) || "").trim();
      if (val) cachedWorkerToken = val;
      return val;
    } catch (e) {
      return "";
    }
  }

  function setStoredToken(token) {
    const clean = String(token || "").trim();
    cachedWorkerToken = clean;
    try {
      if (clean) localStorage.setItem(STORAGE_KEYS.authToken, clean);
      else localStorage.removeItem(STORAGE_KEYS.authToken);
    } catch (e) {}
    return clean;
  }

  function isGlobalBubbleOpen() {
    try {
      return localStorage.getItem(STORAGE_KEYS.bubbleOpen) === "1";
    } catch (e) {
      return false;
    }
  }

  function setGlobalBubbleOpen(open) {
    try {
      localStorage.setItem(STORAGE_KEYS.bubbleOpen, open ? "1" : "0");
    } catch (e) {}
  }

  function isConvoyBubbleOpen() {
    try {
      return localStorage.getItem(STORAGE_KEYS.convoyBubbleOpen) === "1";
    } catch (e) {
      return false;
    }
  }

  function setConvoyBubbleOpen(open) {
    try {
      localStorage.setItem(STORAGE_KEYS.convoyBubbleOpen, open ? "1" : "0");
    } catch (e) {}
  }

  function isAllianceBubbleOpen() {
    try {
      return localStorage.getItem(STORAGE_KEYS.allianceBubbleOpen) === "1";
    } catch (e) {
      return false;
    }
  }

  function setAllianceBubbleOpen(open) {
    try {
      localStorage.setItem(STORAGE_KEYS.allianceBubbleOpen, open ? "1" : "0");
    } catch (e) {}
  }

  function isStatsBubbleOpen() {
    try {
      return localStorage.getItem(STORAGE_KEYS.statsBubbleOpen) === "1";
    } catch (e) {
      return false;
    }
  }

  function setStatsBubbleOpen(open) {
    try {
      localStorage.setItem(STORAGE_KEYS.statsBubbleOpen, open ? "1" : "0");
    } catch (e) {}
  }

  function isPlayersBubbleOpen() {
    try {
      return localStorage.getItem(STORAGE_KEYS.playersBubbleOpen) === "1";
    } catch (e) {
      return false;
    }
  }

  function setPlayersBubbleOpen(open) {
    try {
      localStorage.setItem(STORAGE_KEYS.playersBubbleOpen, open ? "1" : "0");
    } catch (e) {}
  }

  function getCollapsedSections() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.bubbleSections);
      const parsed = JSON.parse(raw || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function toggleSectionCollapsed(secKey) {
    const cur = getCollapsedSections();
    cur[secKey] = !cur[secKey];
    try {
      localStorage.setItem(STORAGE_KEYS.bubbleSections, JSON.stringify(cur));
    } catch (e) {}
    return !!cur[secKey];
  }

  function normalizePseudo(raw) {
    return String(raw || "")
      .replace(/\([^)]*\)/g, "")
      .trim()
      .toLowerCase();
  }

  function samePseudo(a, b) {
    const x = normalizePseudo(a);
    const y = normalizePseudo(b);
    return !!x && x === y;
  }

  function isCleanPlayerName(raw) {
    const s = String(raw || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (!s || s.length > 28) return false;
    if (/\b(?:rang|pseudo|terrain|technologie|fourmili[eè]re|chef|gardien|diplomate|recrue)\b/i.test(s)) {
      return false;
    }
    if (s.split(/\s+/).length > 2) return false;
    return true;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString("fr-FR");
  }

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return (d ? d + "j " : "") + h + "h " + m + "m " + sec + "s";
  }

  function parseFrInt(str) {
    const cleaned = String(str || "").replace(/[\s\u00a0.,]/g, "");
    if (!/^\d+$/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isSafeInteger(n) ? n : null;
  }

  function parseLeadingFrNumber(raw) {
    if (typeof raw === "number") {
      return Number.isFinite(raw) ? raw : null;
    }
    const s = String(raw || "").trim();
    if (!s) return null;
    const m = s.match(/\d{1,3}(?:[\s\u00a0]\d{3})+|\d+/);
    if (!m) return null;
    return parseFrInt(m[0]);
  }

  function computeArrivalTimestamp(remSec, nowMs, existingArrivalTimes = []) {
    const rawArrival = nowMs + remSec * 1000;
    let bestExisting = 0;
    let bestDiff = Infinity;
    for (const t of existingArrivalTimes) {
      const ts = Number(t || 0);
      if (ts <= nowMs) continue;
      const diff = Math.abs(ts - rawArrival);
      if (diff <= 180000 && diff < bestDiff) {
        bestDiff = diff;
        bestExisting = ts;
      }
    }
    return bestExisting || rawArrival;
  }

  function parseRemainingSeconds(text) {
    const match = String(text || "").match(
      /\b(?:dans|durera\s*:?)\s+(.+?)(?=\s+-\s*(?:Retour|Annuler)\b|\s+Arrivée\b|\s+Troupes\s+en\s+attaques?\b|$)/i
    );
    if (!match) return null;
    const src = match[1];
    let days = 0, hours = 0, minutes = 0, seconds = 0, found = false;
    const re = /(\d+)\s*(jours?|j|heures?|h|minutes?|mins?|m|secondes?|secs?|s)\b/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      const val = Number(m[1]);
      const unit = m[2].toLowerCase();
      if (unit === "j" || unit.startsWith("jour")) days = val;
      else if (unit === "h" || unit.startsWith("heure")) hours = val;
      else if (unit === "m" || unit === "min" || unit === "mins" || unit.startsWith("minute")) minutes = val;
      else seconds = val;
      found = true;
    }
    if (!found) return null;
    return days * 86400 + hours * 3600 + minutes * 60 + seconds;
  }

  function parseTroopsList(line) {
    const after = String(line || "").split(/troupes\s+en\s+(?:chasses?|attaques?)\s*:/i)[1] || "";
    return after
      .split(",")
      .map((part) => {
        const clean = part.trim().replace(/\.$/, "");
        const m = clean.match(/^([\d\s\u00a0.,]+)\s+(.+)$/);
        if (!m) return null;
        const quantity = parseFrInt(m[1]);
        const name = m[2].trim();
        if (quantity === null || quantity < 0 || !name) return null;
        return { quantity, name };
      })
      .filter(Boolean);
  }

  function buildStableSig(parts, fallbackArrivalAt, arrivalLabel) {
    const minuteBucket = Math.round(Number(fallbackArrivalAt || 0) / 60000);
    return parts.concat("arr:" + minuteBucket).join("#");
  }

  function readJsonArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeJsonArray(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Optimisation 3 : purge centralisée des entrées expirées (attacks, hunts, movements)
  function readCleanTimedArray(key, now = Date.now(), graceMs = 5000) {
    const rawArr = readJsonArray(key);
    const cleaned = rawArr.filter((item) => item && Number(item.arrivalAt || 0) > now - graceMs);
    if (cleaned.length !== rawArr.length) {
      writeJsonArray(key, cleaned);
    }
    return cleaned;
  }

  function httpJsonRequest(method, url, bodyObj, token = "") {
    const headers = {
      "Content-Type": "application/json"
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const bodyStr = bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined;

    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method,
          url,
          headers,
          data: bodyStr,
          onload: (res) => {
            let data = {};
            try {
              data = JSON.parse(res.responseText || "{}");
            } catch (e) {}
            const ok = res.status >= 200 && res.status < 300;
            resolve(
              ok
                ? { ok: true, status: res.status, data }
                : { ok: false, status: res.status, error: data.error || `HTTP ${res.status}`, data }
            );
          },
          onerror: () => resolve({ ok: false, mode: "network-error", error: "Erreur réseau GM_xmlhttpRequest" })
        });
      });
    }

    return fetch(url, { method, headers, body: bodyStr })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        return res.ok
          ? { ok: true, status: res.status, data }
          : { ok: false, status: res.status, error: data.error || `HTTP ${res.status}`, data };
      })
      .catch((err) => ({ ok: false, mode: "network-error", error: err && err.message ? err.message : String(err) }));
  }

  async function loginToWorker(baseUrl) {
    const authCfg = (WORKER_CONFIG && WORKER_CONFIG.auth) || {};
    const mode = String(authCfg.mode || "member").toLowerCase();

    if (!authCfg.pseudo && !hasStoredDevUser() && !promptedThisLoad) {
      promptedThisLoad = true;
      const typedPseudo = window.prompt("Dôme de la Paix : quel est ton pseudo Fourmizzz ?", "");
      if (typedPseudo && typedPseudo.trim()) setDevUser(typedPseudo.trim());
    }

    const pseudo = String(authCfg.pseudo || getDevUser() || "").trim();
    const configPassword = String(authCfg.password || "").trim();
    let password = configPassword || getStoredPassword();

    if (!password && hasStoredDevUser() && !promptedThisLoad) {
      promptedThisLoad = true;
      const typedPass = window.prompt(
        "Dôme de la Paix : mot de passe pour « " + pseudo + " » (le compte est créé s'il n'existe pas encore).",
        ""
      );
      password = String(typedPass || "").trim();
      if (password) setStoredPassword(password);
    }

    if (!password) {
      return { ok: false, error: "Mot de passe manquant" };
    }

    const loginBody = mode === "admin"
      ? { mode: "admin", pseudo: pseudo || "Administrateur", password }
      : { mode: "member", pseudo, password };

    const loginRes = await httpJsonRequest("POST", `${baseUrl}/api/auth/login`, loginBody);
    if (loginRes.ok && loginRes.data && loginRes.data.token) {
      setStoredToken(loginRes.data.token);
      setStoredPassword(password);
      return { ok: true, token: loginRes.data.token };
    }

    if (mode !== "admin" && authCfg.autoRegister && loginRes.status === 404 && pseudo) {
      const regRes = await httpJsonRequest("POST", `${baseUrl}/api/auth/register`, { pseudo, password });
      if (regRes.ok && regRes.data && regRes.data.token) {
        setStoredToken(regRes.data.token);
        setStoredPassword(password);
        return { ok: true, token: regRes.data.token };
      }
    }

    if (loginRes.status === 401 && !configPassword) {
      setStoredPassword("");
      promptedThisLoad = false;
    }

    return { ok: false, error: loginRes.error || "Connexion au Worker refusée" };
  }

  async function ensureWorkerToken(baseUrl, forceRefresh = false) {
    if (!forceRefresh) {
      const existing = getStoredToken();
      if (existing) return existing;
    }
    if (!loginPromise) {
      loginPromise = loginToWorker(baseUrl).finally(() => {
        loginPromise = null;
      });
    }
    const authResult = await loginPromise;
    return authResult && authResult.ok ? authResult.token : "";
  }

  function resolveWorkerEndpoint(kind) {
    if (kind === "hunts" || kind === "attacks" || kind === "movements") return "/api/movements";
    if (kind === "convoy_requests" || kind === "requests") return "/api/requests";
    if (kind === "players") return "/api/players";
    return "/api/state";
  }

  async function syncWithWorker(payload, dedupKey = null) {
    if (!WORKER_CONFIG.enabled) {
      setSyncState("local", "Local seul");
      return { ok: true, mode: "local-only" };
    }

    const baseUrl = String(WORKER_CONFIG.endpoint || "").replace(/\/+$/, "");
    if (!baseUrl) {
      setSyncState("error", "URL manquante");
      return { ok: false, mode: "missing-endpoint", error: "URL Worker manquante" };
    }

    const kind = (payload && payload.kind) || "state";
    const cacheKey = dedupKey === false ? "" : (dedupKey || kind);
    let sig = "";
    if (cacheKey) {
      try {
        sig = JSON.stringify(payload);
      } catch (e) {}
      if (sig && lastSentSig[cacheKey] === sig) {
        return { ok: true, mode: "unchanged" };
      }
    }

    if (Date.now() < nextRetryAt) {
      setSyncState("backoff", "Pause synchro");
      return { ok: false, mode: "backoff", error: "Nouvel essai différé" };
    }

    setSyncState("syncing", "Envoi…");
    let token = await ensureWorkerToken(baseUrl, false);
    if (!token) {
      nextRetryAt = Date.now() + RETRY_DELAY_MS;
      setSyncState("error", "Auth requise");
      return { ok: false, mode: "auth-failed", error: "Impossible d'obtenir un token Worker" };
    }

    const path = resolveWorkerEndpoint(kind);
    let res = await httpJsonRequest("POST", `${baseUrl}${path}`, payload, token);

    if (!res.ok && res.status === 401) {
      setStoredToken("");
      token = await ensureWorkerToken(baseUrl, true);
      if (token) {
        res = await httpJsonRequest("POST", `${baseUrl}${path}`, payload, token);
      }
    }

    if (res.ok) {
      if (cacheKey && sig) lastSentSig[cacheKey] = sig;
      setSyncState("ok", "Synchro OK");
    } else {
      nextRetryAt = Date.now() + RETRY_DELAY_MS;
      setSyncState("error", "Erreur synchro");
    }

    return res;
  }

  function archiveFinishedHunts(activeList, now = Date.now()) {
    const activeIds = new Set((activeList || []).map((h) => String(h.sig || h.id)));
    const prevStored = readJsonArray(STORAGE_KEYS.hunts);
    const history = readJsonArray(STORAGE_KEYS.huntHistory);
    const existingIds = new Set(history.map((item) => String(item.sig || item.id)));
    let added = false;

    for (const h of prevStored) {
      if (!h) continue;
      const id = String(h.sig || h.id);
      if (Number(h.arrivalAt || 0) <= now && !activeIds.has(id) && !existingIds.has(id)) {
        history.unshift({
          ...h,
          finishedAt: Number(h.arrivalAt) || now
        });
        existingIds.add(id);
        added = true;
      }
    }

    if (added) {
      writeJsonArray(STORAGE_KEYS.huntHistory, history.slice(0, 25));
    }
  }

  function recordHuntBenchmark(huntItem, now = Date.now()) {
    if (!huntItem || !huntItem.area || huntItem.area <= 0) return;
    const totalDurationSec = Math.max(
      1,
      Math.round((Number(huntItem.arrivalAt || now) - Number(huntItem.firstSeenAt || huntItem.detectedAt || now)) / 1000)
    );
    const benchmarks = readJsonArray(STORAGE_KEYS.huntBenchmarks);
    const areaKey = Number(huntItem.area);
    const existingIdx = benchmarks.findIndex((b) => Number(b.area) === areaKey);

    const entry = {
      area: areaKey,
      durationSec: totalDurationSec,
      player: huntItem.player || getDevUser(),
      updatedAt: now
    };

    if (existingIdx >= 0) {
      const prev = benchmarks[existingIdx];
      benchmarks[existingIdx] = {
        ...prev,
        durationSec: Math.max(Number(prev.durationSec || 0), totalDurationSec),
        updatedAt: now
      };
    } else {
      benchmarks.unshift(entry);
    }

    const sorted = benchmarks
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, 12);
    writeJsonArray(STORAGE_KEYS.huntBenchmarks, sorted);
  }

  function mergeRemoteHunts(remoteHunts) {
    const now = Date.now();
    const myNorm = normalizePseudo(getDevUser());
    const localList = readCleanTimedArray(STORAGE_KEYS.hunts, now);
    const mineLocal = localList.filter((h) => normalizePseudo(h.player) === myNorm);

    const othersRemote = remoteHunts
      .filter((m) => normalizePseudo(m.from && m.from.name) !== myNorm && Number(m.arrivalAt) > now)
      .map((m) => ({
        id: String(m.id),
        sig: String(m.id),
        type: "hunt",
        player: (m.from && m.from.name) || "Joueur",
        area: Number(m.area) || 0,
        troops: [],
        arrivalLabel: m.arrivalLabel || "",
        firstSeenAt: Number(m.startAt) || now,
        detectedAt: Number(m.startAt) || now,
        arrivalAt: Number(m.arrivalAt),
        active: true
      }));

    const merged = mineLocal.concat(othersRemote);
    archiveFinishedHunts(merged, now);
    writeJsonArray(STORAGE_KEYS.hunts, merged);
    return merged;
  }

  function mergeRemoteAttacks(remoteAttacks) {
    const now = Date.now();
    const myNorm = normalizePseudo(getDevUser());
    const localList = readCleanTimedArray(STORAGE_KEYS.attacks, now);
    const mineLocal = localList.filter((a) => normalizePseudo(a.attacker) === myNorm);

    const othersRemote = remoteAttacks
      .filter((m) => normalizePseudo(m.from && m.from.name) !== myNorm && Number(m.arrivalAt) > now)
      .map((m) => {
        const targetName = (m.to && m.to.name) || "";
        const troops = Array.isArray(m.troops) ? m.troops : [];
        const totalAnts = Number(m.ants) || troops.reduce((s, t) => s + (Number(t.quantity) || 0), 0);
        return {
          id: String(m.id),
          sig: String(m.id),
          type: "attack",
          attacker: (m.from && m.from.name) || "Inconnu",
          target: targetName,
          targetPseudo: normalizePseudo(targetName),
          targetKind: m.targetKind || "",
          troops,
          ants: totalAnts,
          arrivalLabel: m.arrivalLabel || "",
          detectedAt: Number(m.startAt) || now,
          arrivalAt: Number(m.arrivalAt),
          active: true
        };
      });

    const merged = mineLocal.concat(othersRemote);
    writeJsonArray(STORAGE_KEYS.attacks, merged);
    return merged;
  }

  function convoyDedupeKey(m) {
    const fromN = normalizePseudo((m.from && m.from.name) || m.createdBy || "");
    const toN = normalizePseudo((m.to && m.to.name) || "");
    const wood = Number(m.wood || 0);
    const apples = Number(m.apples || 0);
    const arrMin = Math.round(Number(m.arrivalAt || 0) / 60000);
    return `${fromN}|${toN}|${wood}|${apples}|${arrMin}`;
  }

  function mergeRemoteConvoys(remoteConvoys) {
    const now = Date.now();
    const localList = readCleanTimedArray(STORAGE_KEYS.movements, now);
    const byKey = new Map();

    for (const m of localList) {
      if (!m || Number(m.arrivalAt) <= now) continue;
      byKey.set(convoyDedupeKey(m), m);
    }

    for (const m of remoteConvoys) {
      if (!m || m.id === undefined || Number(m.arrivalAt) <= now) continue;
      const key = convoyDedupeKey(m);
      if (!byKey.has(key)) {
        byKey.set(key, m);
      }
    }

    const merged = Array.from(byKey.values());
    writeJsonArray(STORAGE_KEYS.movements, merged);
    return merged;
  }

  async function pullFromWorker(force = false) {
    if (!WORKER_CONFIG.enabled) {
      setSyncState("local", "Local seul");
      return false;
    }
    const baseUrl = String(WORKER_CONFIG.endpoint || "").replace(/\/+$/, "");
    if (!baseUrl) {
      setSyncState("error", "URL manquante");
      return false;
    }
    if (!force && Date.now() < nextRetryAt) {
      setSyncState("backoff", "Pause synchro");
      return false;
    }
    if (force) {
      nextRetryAt = 0;
    }

    setSyncState("syncing", "Synchro…");
    let token = await ensureWorkerToken(baseUrl, false);
    if (!token) {
      nextRetryAt = Date.now() + RETRY_DELAY_MS;
      setSyncState("error", "Auth requise");
      return false;
    }

    let res = await httpJsonRequest("GET", `${baseUrl}/api/sync`, undefined, token);

    if (!res.ok && res.status === 401) {
      setStoredToken("");
      token = await ensureWorkerToken(baseUrl, true);
      if (token) {
        res = await httpJsonRequest("GET", `${baseUrl}/api/sync`, undefined, token);
      }
    }

    if (!res.ok) {
      nextRetryAt = Date.now() + RETRY_DELAY_MS;
      setSyncState("error", "Erreur synchro");
      return false;
    }

    setSyncState("ok", "Synchro OK");
    const data = res.data || {};

    if (typeof data.updatedAt === "number") {
      lastSyncUpdatedAt = data.updatedAt;
    }

    if (Array.isArray(data.players)) {
      ingestRemotePlayersTdc(data.players);
    } else if (data.state && Array.isArray(data.state.players)) {
      ingestRemotePlayersTdc(data.state.players);
    }

    const rawStats =
      data.stats ||
      data.statistics ||
      (data.state && (data.state.stats || data.state.statistics)) ||
      null;
    if (rawStats && typeof rawStats === "object") {
      ingestRemoteStats(rawStats);
    }

    const allMovements = Array.isArray(data.movements) ? data.movements : [];
    mergeRemoteHunts(allMovements.filter((m) => m && m.type === "hunt"));
    mergeRemoteAttacks(allMovements.filter((m) => m && m.type === "attack"));
    mergeRemoteConvoys(allMovements.filter((m) => m && m.type === "convoy"));

    if (Array.isArray(data.requests)) {
      convoyRequests = data.requests.map((r) => ({
        ...r,
        deliveries: Array.isArray(r.deliveries) ? r.deliveries : []
      }));
      writeJsonArray(STORAGE_KEYS.convoyRequests, convoyRequests);
    }

    return true;
  }
  function isMembersPageView() {
    if (!PATH.includes("alliance.php")) return false;
    const bodyText = document.body ? document.body.innerText : "";
    const hasMembersTitle = /membres/i.test(bodyText) || SEARCH.includes("membres") || HREF.includes("membres");
    if (!hasMembersTitle) return false;
    if (OWN_ALLIANCE_TAG && !new RegExp(`\\b${OWN_ALLIANCE_TAG}\\b`, "i").test(bodyText)) {
      return false;
    }
    return /\bpseudo\b/i.test(bodyText) && (/\bterrain\b/i.test(bodyText) || /\btdc\b/i.test(bodyText));
  }

  function scrapeAllianceMembersTdc() {
    if (!document.body || !isMembersPageView()) return 0;
    const map = cleanAllianceTdcMap();
    const now = Date.now();
    let count = 0;

    const tables = Array.from(document.querySelectorAll("table"));
    for (const tbl of tables) {
      if (tbl.closest && (tbl.closest("#fmz-gb-root") || tbl.closest("#fmz-gb-left-dock"))) continue;
      const rows = Array.from(tbl.rows || []);
      if (rows.length < 2) continue;

      let pseudoColIdx = -1;
      let terrainColIdx = -1;

      const headerCells = Array.from(rows[0].cells || []).map((c) =>
        (c.innerText || "").replace(/\s+/g, " ").trim().toLowerCase()
      );
      headerCells.forEach((h, idx) => {
        if (h.includes("pseudo") || h.includes("joueur") || h.includes("membre")) {
          if (pseudoColIdx === -1) pseudoColIdx = idx;
        }
        if (h.includes("terrain") || h.includes("tdc") || h.includes("cm²") || h.includes("cm2")) {
          if (terrainColIdx === -1) terrainColIdx = idx;
        }
      });

      if (pseudoColIdx === -1 || terrainColIdx === -1) continue;

      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].cells || []);
        if (cells.length <= Math.max(pseudoColIdx, terrainColIdx)) continue;

        const rawPseudo = (cells[pseudoColIdx].innerText || "").replace(/\s+/g, " ").trim();
        const rawTerrain = (cells[terrainColIdx].innerText || "").replace(/\s+/g, " ").trim();

        const norm = normalizePseudo(rawPseudo);
        const tdcVal = parseLeadingFrNumber(rawTerrain);
        if (!norm || !Number.isFinite(tdcVal) || tdcVal <= 0) continue;

        if (!isKnownAllianceMemberName(rawPseudo)) continue;

        map[norm] = {
          pseudo: rawPseudo,
          tdc: Math.floor(tdcVal),
          alliance: OWN_ALLIANCE_TAG,
          source: "alliance_page",
          updatedAt: now
        };
        count++;
      }
    }

    if (count > 0) {
      map._lastScanAt = now;
      writeAllianceTdcMap(map);
      const statsPayload = computeAndStoreAllianceStatsFromMap(map, now);
      const playersList = Object.entries(map)
        .filter(([k, v]) => k && !k.startsWith("_") && LDDLP_KEYS.has(k) && v && v.tdc > 0)
        .map(([, v]) => ({
          name: playerDisplayName(v.pseudo),
          pseudo: playerDisplayName(v.pseudo),
          tdc: Math.floor(v.tdc),
          alliance: OWN_ALLIANCE_TAG
        }));
      syncWithWorker({ kind: "players", alliance: OWN_ALLIANCE_TAG, players: playersList }, "lddlp_players");
      if (statsPayload) {
        syncWithWorker({ kind: "stats", alliance: OWN_ALLIANCE_TAG, stats: statsPayload }, "lddlp_stats");
      }
    }
    return count;
  }

  function extractHuntsFromPage() {
    const now = Date.now();
    const playerName = getDevUser();
    const existingArrivals = readCleanTimedArray(STORAGE_KEYS.hunts, now).map((h) => h && h.arrivalAt);
    const fullText = document.body ? document.body.innerText : "";
    const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    const blocks = [];
    let current = null;

    for (const line of lines) {
      if (/^-?\s*vos\s+chasseuses?\s+vont\s+conqu[eé]rir\b/i.test(line)) {
        if (current) blocks.push(current);
        current = [line.replace(/^-+\s*/, "")];
      } else if (current) {
        if (/^(?:attaque\(s\)\s+en\s+cours|vos\s+arm[ée]es?|convois?)/i.test(line)) {
          blocks.push(current);
          current = null;
        } else {
          current.push(line);
        }
      }
    }
    if (current) blocks.push(current);

    const detected = [];
    blocks.forEach((blk, idx) => {
      const head = blk[0];
      const remSec = parseRemainingSeconds(head);
      if (remSec === null || remSec <= 0) return;

      const areaMatch = head.match(/conqu[eé]rir\s+([\d\s\u00a0.,]+)\s*cm(?:²|2)/i);
      const area = areaMatch ? parseLeadingFrNumber(areaMatch[1]) : null;
      const arrivalMatch = blk.join(" ").match(/arriv[ée]e?\s+((?:demain\s+)?à\s+\d{1,2}h\d{2})/i);
      const arrivalLabel = arrivalMatch ? arrivalMatch[1] : "";

      const arrivalAt = computeArrivalTimestamp(remSec, now, existingArrivals);
      const sig = buildStableSig(
        [
          normalizePseudo(playerName),
          area || 0
        ],
        arrivalAt,
        arrivalLabel
      );

      detected.push({
        id: "hunt_" + sig + "_" + idx,
        sig,
        type: "hunt",
        player: playerName,
        area,
        troops: [],
        arrivalLabel,
        firstSeenAt: now,
        detectedAt: now,
        arrivalAt,
        active: true
      });
    });

    return detected;
  }

  function reconcileHunts() {
    const now = Date.now();
    const playerName = getDevUser();
    const normPlayer = normalizePseudo(playerName);
    const currentScan = extractHuntsFromPage();
    const seenSigs = new Set(currentScan.map((h) => h.sig));

    let stored = readCleanTimedArray(STORAGE_KEYS.hunts, now);

    stored = stored.filter((h) => {
      if (normalizePseudo(h.player) !== normPlayer) return true;
      if (!h.active || h.arrivalAt <= now) return false;
      return seenSigs.has(h.sig);
    });

    const bySig = new Map(stored.map((h) => [h.sig, h]));
    for (const item of currentScan) {
      const prev = bySig.get(item.sig);
      if (prev) {
        const diff = Math.abs(prev.arrivalAt - item.arrivalAt);
        const mergedItem = {
          ...prev,
          area: item.area ?? prev.area,
          troops: [],
          arrivalLabel: item.arrivalLabel || prev.arrivalLabel,
          firstSeenAt: Number(prev.firstSeenAt || prev.detectedAt || item.firstSeenAt || now),
          arrivalAt: diff < 180000 ? prev.arrivalAt : item.arrivalAt,
          active: true
        };
        bySig.set(item.sig, mergedItem);
        recordHuntBenchmark(mergedItem, now);
      } else {
        bySig.set(item.sig, item);
        recordHuntBenchmark(item, now);
      }
    }

    const nextHunts = Array.from(bySig.values());
    archiveFinishedHunts(nextHunts, now);
    writeJsonArray(STORAGE_KEYS.hunts, nextHunts);
    const myHunts = nextHunts
      .filter((h) => normalizePseudo(h.player) === normPlayer)
      .map((h) => ({
        id: h.id,
        sig: h.sig,
        type: "hunt",
        player: h.player,
        area: h.area || 0,
        arrivalLabel: h.arrivalLabel || "",
        firstSeenAt: h.firstSeenAt,
        detectedAt: h.detectedAt,
        arrivalAt: h.arrivalAt,
        active: true
      }));
    syncWithWorker({ kind: "hunts", player: playerName, hunts: myHunts });
    return nextHunts;
  }

  function findHuntAreaInput() {
    const inputs = Array.from(document.querySelectorAll("input[type='text'], input[type='number'], input:not([type])"))
      .filter((el) => !(el.closest && (el.closest("#fmz-gb-root") || el.closest("#fmz-gb-left-dock"))));
    for (const inp of inputs) {
      const ctx = ((inp.parentElement && inp.parentElement.innerText) || "") + " " + (inp.name || "") + " " + (inp.id || "");
      if (/cm(?:²|2)|terrain|superficie/i.test(ctx)) return inp;
    }
    return inputs[0] || null;
  }

  function updateAcquerirTerrainPreview() {
    if (!IS_ACQUERIR_TERRAIN || !document.body) return;
    const areaInp = findHuntAreaInput();
    if (!areaInp) return;

    let previewBox = document.getElementById("fmz-hunt-live-preview");
    if (!previewBox) {
      previewBox = document.createElement("div");
      previewBox.id = "fmz-hunt-live-preview";
      previewBox.style.cssText =
        "margin-top:8px;padding:8px 10px;background:#111827;color:#f3f4f6;border:1px solid #4b5563;border-radius:8px;font-size:12px;line-height:1.45;";
      areaInp.insertAdjacentElement("afterend", previewBox);
      areaInp.addEventListener("input", updateAcquerirTerrainPreview);
      areaInp.addEventListener("change", updateAcquerirTerrainPreview);
    }

    const areaVal = parseFrInt(areaInp.value) || 0;
    const baseTdc = getPlayerTdc(getDevUser());

    if (areaVal <= 0) {
      previewBox.innerHTML =
        `🎯 <b>Aperçu chasse :</b> saisis un terrain à conquérir pour voir le <b>TDC après chasse</b> et la <b>durée estimée</b>` +
        (baseTdc ? ` (TDC actuel : <b>${formatNumber(baseTdc)} cm²</b>)` : "") +
        `.`;
      return;
    }

    const afterTdc = baseTdc ? baseTdc + areaVal : null;
    const estSec = estimateHuntDurationSec(areaVal);
    previewBox.innerHTML =
      `🎯 <b>Aperçu chasse (+${formatNumber(areaVal)} cm²) :</b><br>` +
      `• TDC : ${baseTdc ? `<b>${formatNumber(baseTdc)} → ${formatNumber(afterTdc)} cm²</b>` : `<i>TDC actuel inconnu (ouvre Membres)</i>`}<br>` +
      `• Durée estimée : <b>${formatDuration(estSec)}</b>`;
  }

  function setupAcquerirTerrainGuard() {
    if (!IS_ACQUERIR_TERRAIN || !document.body) return;
    updateAcquerirTerrainPreview();
    if (document.body.dataset.fmzHuntGuardBound === "1") return;
    document.body.dataset.fmzHuntGuardBound = "1";

    const readPlannedHuntDurationSec = (areaVal) => {
      const bodyText = document.body ? document.body.innerText : "";
      const durLine = bodyText.split(/\r?\n/).find((l) => /cette\s+chasse\s+durera/i.test(l));
      const parsedSec = durLine ? parseRemainingSeconds(durLine) : null;
      if (parsedSec && parsedSec > 0) return parsedSec;
      return estimateHuntDurationSec(areaVal) || 60;
    };

    const checkHuntImpact = (areaVal) => {
      const now = Date.now();
      const playerName = getDevUser();
      const playerNorm = normalizePseudo(playerName);
      const durSec = readPlannedHuntDurationSec(areaVal);
      const simHunt = {
        id: "sim_hunt_" + now,
        sig: "sim_hunt_" + now,
        type: "hunt",
        player: playerName,
        area: areaVal,
        arrivalAt: now + durSec * 1000
      };

      const beforeSim = simulateTimeline(now, []);
      const afterSim = simulateTimeline(now, [simHunt]);

      const newlyFailing = [];
      for (const [atkId, afterEv] of afterSim.attacks.entries()) {
        if (!afterEv.willFail) continue;
        const beforeEv = beforeSim.attacks.get(atkId);
        if (beforeEv && beforeEv.willFail) continue;

        const atk = afterEv.item;
        const involvesMe =
          normalizePseudo(atk.attacker) === playerNorm ||
          normalizePseudo(atk.target) === playerNorm;
        if (!involvesMe) continue;

        newlyFailing.push(
          `• ${atk.attacker} → ${atk.target} (${afterEv.failReason}, TDC ${formatNumber(afterEv.attacker.before)} vs ${formatNumber(afterEv.target.before)} cm²)`
        );
      }

      return newlyFailing;
    };

    const handleLaunchAttempt = (e) => {
      const areaInp = findHuntAreaInput();
      const areaVal = areaInp ? (parseFrInt(areaInp.value) || 0) : 0;
      if (areaVal <= 0) return;

      const failingAttacks = checkHuntImpact(areaVal);
      if (!failingAttacks.length) return;

      const msg =
        `⚠️ Attention : lancer cette chasse de +${formatNumber(areaVal)} cm² va faire échouer ${failingAttacks.length} attaque(s) en cours (règle 50%–300% du TDC) :\n\n` +
        failingAttacks.join("\n") +
        `\n\nVeux-tu quand même lancer la chasse ?`;

      if (!window.confirm(msg)) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      }
    };

    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("input[type='submit'], button") : null;
        if (!btn) return;
        if (btn.closest && (btn.closest("#fmz-gb-root") || btn.closest("#fmz-gb-left-dock"))) return;
        const label = ((btn.value || btn.innerText || "")).trim();
        if (/lancer\s+la\s+chasse/i.test(label)) {
          handleLaunchAttempt(e);
        }
      },
      true
    );
  }

  function getIncomingAttacksForCurrentUser() {
    const now = Date.now();
    const meNorm = normalizePseudo(getDevUser());
    if (!meNorm) return [];

    return readCleanTimedArray(STORAGE_KEYS.attacks, now)
      .filter((a) => a && a.arrivalAt > now && normalizePseudo(a.target) === meNorm)
      .sort((a, b) => Number(a.arrivalAt || 0) - Number(b.arrivalAt || 0));
  }

  function getAllAllianceAttacks(now = Date.now()) {
    const seen = new Set();
    return readCleanTimedArray(STORAGE_KEYS.attacks, now)
      .filter((a) => {
        if (!a || Number(a.arrivalAt || 0) <= now) return false;
        const k = String(a.sig || a.id);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => Number(a.arrivalAt || 0) - Number(b.arrivalAt || 0));
  }

  function getAllActiveHunts(now = Date.now()) {
    return readCleanTimedArray(STORAGE_KEYS.hunts, now)
      .filter((h) => h && Number(h.arrivalAt || 0) > now)
      .sort((a, b) => Number(a.arrivalAt || 0) - Number(b.arrivalAt || 0));
  }

  let convoyRequests = readJsonArray(STORAGE_KEYS.convoyRequests);
  convoyRequests.forEach((r) => {
    if (!Array.isArray(r.deliveries)) r.deliveries = [];
  });
  let convoyLog = readJsonArray(STORAGE_KEYS.convoyLog);
  const convoyDrafts = {};
  let lastCommerceMessage = "";
  let accountDrawerOpen = false;

  function saveConvoyRequestsLocal() {
    writeJsonArray(STORAGE_KEYS.convoyRequests, convoyRequests);
  }

  function saveConvoyLog() {
    writeJsonArray(STORAGE_KEYS.convoyLog, convoyLog.slice(-50));
  }

  function getConvoySummaryForUser(userName, now = Date.now()) {
    const meNorm = normalizePseudo(userName);
    if (!meNorm) return { incoming: [], outgoing: [] };

    const activeMovements = readCleanTimedArray(STORAGE_KEYS.movements, now).filter(
      (m) => m && m.type === "convoy" && Number(m.arrivalAt || 0) > now
    );

    const byKey = new Map();
    for (const m of activeMovements) {
      const fromName = (m.from && m.from.name) || m.createdBy || "Joueur";
      const toName = (m.to && m.to.name) || "Destinataire";
      const wood = Number(m.wood) || 0;
      const apples = Number(m.apples) || 0;
      const arrivalAt = Number(m.arrivalAt);
      const key = `${normalizePseudo(fromName)}|${normalizePseudo(toName)}|${wood}|${apples}|${Math.round(arrivalAt / 60000)}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          id: String(m.id || key),
          fromName,
          toName,
          wood,
          apples,
          arrivalAt
        });
      }
    }

    for (const r of convoyRequests) {
      if (!r || !Array.isArray(r.deliveries)) continue;
      for (const d of r.deliveries) {
        const arrAt = Number(d && d.arrivalAt || 0);
        if (!arrAt || arrAt <= now) continue;
        const fromName = d.by || d.loggedBy || "Joueur";
        const toName = r.player || "Destinataire";
        const wood = Number(d.wood) || 0;
        const apples = Number(d.apples) || 0;
        const key = `${normalizePseudo(fromName)}|${normalizePseudo(toName)}|${wood}|${apples}|${Math.round(arrAt / 60000)}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            id: d.movementId ? String(d.movementId) : key,
            fromName,
            toName,
            wood,
            apples,
            arrivalAt: arrAt
          });
        }
      }
    }

    const all = Array.from(byKey.values()).sort((a, b) => a.arrivalAt - b.arrivalAt);
    return {
      incoming: all.filter((c) => normalizePseudo(c.toName) === meNorm),
      outgoing: all.filter((c) => normalizePseudo(c.fromName) === meNorm)
    };
  }

  let armeeBubbleTimer = null;
  let lastArmeeSnapshotKey = "";
  let commerceBubbleTimer = null;
  let lastCommerceSnapshotKey = "";

  function ensureArmeeIndicator() {
    if (!IS_ATTACK_PAGE && !IS_COMMERCE) return null;
    if (!document.body) return null;
    if (!document.getElementById("fmz-armee-style")) {
      const style = document.createElement("style");
      style.id = "fmz-armee-style";
      style.textContent = `
        #fmz-armee-badge-wrap{
          position:fixed;right:12px;bottom:58px;z-index:10001;
          display:flex;align-items:center;gap:8px;
          font-family:Arial,sans-serif;pointer-events:none;
        }
        #fmz-armee-bubble{
          background:#166534;border:1px solid #22c55e;color:#ffffff;
          padding:6px 11px;border-radius:999px;font-size:12px;font-weight:bold;
          box-shadow:0 6px 18px rgba(0,0,0,.45);
          opacity:0;transform:translateY(6px);
          transition:opacity .2s ease,transform .2s ease;white-space:nowrap;
        }
        #fmz-armee-bubble.show{opacity:1;transform:translateY(0)}
      `;
      (document.head || document.body).appendChild(style);
    }

    let wrap = document.getElementById("fmz-armee-badge-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "fmz-armee-badge-wrap";
      wrap.innerHTML = `<div id="fmz-armee-bubble" role="status" aria-live="polite"></div>`;
      document.body.appendChild(wrap);
    } else if (!document.body.contains(wrap)) {
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function showArmeeImportedBubble(message = "Attaques importées") {
    if (!IS_ATTACK_PAGE && !IS_COMMERCE) return;
    ensureArmeeIndicator();
    const bubble = document.getElementById("fmz-armee-bubble");
    if (!bubble) return;
    bubble.textContent = message;
    bubble.classList.add("show");
    const activeTimer = IS_COMMERCE ? commerceBubbleTimer : armeeBubbleTimer;
    if (activeTimer) clearTimeout(activeTimer);
    const timerId = setTimeout(() => {
      bubble.classList.remove("show");
    }, 3000);
    if (IS_COMMERCE) commerceBubbleTimer = timerId;
    else armeeBubbleTimer = timerId;
  }

  function extractAttacksFromArmeePage() {
    const now = Date.now();
    const attackerName = getDevUser();
    const existingArrivals = readCleanTimedArray(STORAGE_KEYS.attacks, now).map((a) => a && a.arrivalAt);
    const fullText = document.body ? document.body.innerText : "";
    const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    const blocks = [];
    let current = null;

    for (const line of lines) {
      if (/^-?\s*vous\s+allez\s+attaquer\s+/i.test(line)) {
        if (current) blocks.push(current);
        current = [line.replace(/^-+\s*/, "")];
      } else if (current) {
        if (/^(?:troupes\s+en\s+attaques?\s*:|arriv[ée]e?\s+(?:demain\s+)?à\s+)/i.test(line)) {
          current.push(line);
        } else if (
          /^-?\s*vous\s+(?:allez|chassez|convoquez)/i.test(line) ||
          (/^[A-ZÉÈÊÀÂÎÔÛ].{0,40}$/.test(line) && !line.includes(":"))
        ) {
          blocks.push(current);
          current = null;
        }
      }
    }
    if (current) blocks.push(current);

    const parsed = [];
    blocks.forEach((blk, idx) => {
      const head = blk[0];
      const remSec = parseRemainingSeconds(head);
      if (remSec === null || remSec <= 0) return;

      const targetMatch = head.match(/vous\s+allez\s+attaquer\s+(.+?)\s+dans\s+/i);
      const rawTargetFull = targetMatch ? targetMatch[1].trim() : "";
      const kindMatch = rawTargetFull.match(/\((Terrain de chasse|Fourmilière|Fourmiliere|Dôme|Dome)\)\s*$/i);
      const targetKind = kindMatch ? kindMatch[1] : "";
      const targetRaw = kindMatch
        ? rawTargetFull.slice(0, kindMatch.index).trim()
        : rawTargetFull;
      const targetPseudo = normalizePseudo(targetRaw);

      if (!targetPseudo) return;

      const troopLine = blk.find((l) => /troupes\s+en\s+attaques?\s*:/i.test(l)) || "";
      const troops = parseTroopsList(troopLine);
      let totalAnts = troops.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
      if (totalAnts <= 0) {
        const antMatch = blk.join(" ").match(/([\d\s\u00a0.,]+)\s+fourmis?\b/i);
        if (antMatch) {
          totalAnts = parseFrInt(antMatch[1]) || 0;
        }
      }

      const arrivalLine = blk.find((l) => /arriv[ée]e?\s+(?:demain\s+)?à\s+/i.test(l)) || "";
      const arrivalMatch = arrivalLine.match(/arriv[ée]e?\s+((?:demain\s+)?à\s+\d{1,2}h\d{2})/i);
      const arrivalLabel = arrivalMatch ? arrivalMatch[1] : "";

      const arrivalAt = computeArrivalTimestamp(remSec, now, existingArrivals);
      const sig = buildStableSig(
        [
          normalizePseudo(attackerName),
          targetPseudo,
          totalAnts,
          troops.map((t) => `${t.quantity}:${t.name.toLowerCase()}`).join("|")
        ],
        arrivalAt,
        arrivalLabel
      );

      parsed.push({
        id: "atk_" + sig + "_" + idx,
        sig,
        type: "attack",
        attacker: attackerName,
        target: targetRaw,
        targetPseudo,
        targetKind,
        troops,
        ants: totalAnts,
        arrivalLabel,
        rawText: blk.join(" "),
        detectedAt: now,
        arrivalAt,
        active: true
      });
    });

    return parsed;
  }

  function reconcileArmeeAttacks() {
    const now = Date.now();
    const attackerName = getDevUser();
    const normAttacker = normalizePseudo(attackerName);
    const currentScan = extractAttacksFromArmeePage();
    const seenSigs = new Set(currentScan.map((a) => a.sig));

    let stored = readCleanTimedArray(STORAGE_KEYS.attacks, now);

    stored = stored.filter((a) => {
      if (normalizePseudo(a.attacker) !== normAttacker) return true;
      if (!a.active || a.arrivalAt <= now) return false;
      return seenSigs.has(a.sig);
    });

    const bySig = new Map(stored.map((a) => [a.sig, a]));
    let addedOrUpdatedCount = 0;

    for (const item of currentScan) {
      const prev = bySig.get(item.sig);
      if (prev) {
        const diff = Math.abs(prev.arrivalAt - item.arrivalAt);
        bySig.set(item.sig, {
          ...prev,
          attacker: attackerName,
          target: item.target,
          targetPseudo: item.targetPseudo,
          targetKind: item.targetKind || prev.targetKind,
          troops: item.troops.length ? item.troops : prev.troops,
          ants: item.ants || prev.ants,
          arrivalLabel: item.arrivalLabel || prev.arrivalLabel,
          rawText: item.rawText || prev.rawText || "",
          arrivalAt: diff < 180000 ? prev.arrivalAt : item.arrivalAt,
          active: true
        });
      } else {
        bySig.set(item.sig, item);
        addedOrUpdatedCount++;
      }
    }

    const nextAttacks = Array.from(bySig.values());
    writeJsonArray(STORAGE_KEYS.attacks, nextAttacks);
    const myAttacks = nextAttacks.filter((a) => normalizePseudo(a.attacker) === normAttacker);
    syncWithWorker({ kind: "attacks", attacker: attackerName, attacks: myAttacks });

    const snapshotKey = currentScan.map((a) => a.sig).sort().join("||");
    if (currentScan.length > 0 && (addedOrUpdatedCount > 0 || snapshotKey !== lastArmeeSnapshotKey)) {
      lastArmeeSnapshotKey = snapshotKey;
      showArmeeImportedBubble("Attaques importées");
    } else if (currentScan.length === 0) {
      lastArmeeSnapshotKey = "";
    }

    return nextAttacks;
  }

  function removeLegacyRessourcesPanel() {
    const oldPanel = document.getElementById("fmz-panel");
    if (oldPanel) oldPanel.remove();
    const oldStyle = document.getElementById("fmz-script-style");
    if (oldStyle) oldStyle.remove();
  }

  function findPlayerByPseudo(name) {
    const n = normalizePseudo(name);
    return DEFAULT_PLAYERS.find((p) => normalizePseudo(p.name) === n) || null;
  }

  function reqDelivered(r) {
    return (r.deliveries || []).reduce(
      (t, d) => ({ wood: t.wood + (d.wood || 0), apples: t.apples + (d.apples || 0) }),
      { wood: 0, apples: 0 }
    );
  }

  function reqRemaining(r) {
    const del = reqDelivered(r);
    return {
      wood: Math.max(0, (r.wood || 0) - del.wood),
      apples: Math.max(0, (r.apples || 0) - del.apples)
    };
  }

  function isPartialRequest(r) {
    const del = reqDelivered(r);
    return r.status !== "done" && (del.wood > 0 || del.apples > 0);
  }

  function getActiveDeliveryArrivalAt(r, now = Date.now()) {
    const futureTimes = (r.deliveries || [])
      .map((d) => Number(d && d.arrivalAt || 0))
      .filter((t) => Number.isFinite(t) && t > now);
    if (!futureTimes.length) return 0;
    return Math.min(...futureTimes);
  }

  function getOngoingDirectConvoys(now = Date.now()) {
    const raw = readCleanTimedArray(STORAGE_KEYS.movements, now).filter(
      (m) => m && m.type === "convoy" && Number(m.arrivalAt || 0) > now
    );
    const byKey = new Map();
    for (const m of raw) {
      const k = convoyDedupeKey(m);
      if (!byKey.has(k)) byKey.set(k, m);
    }
    return Array.from(byKey.values());
  }

  function isOwnRequest(r, currentUser) {
    return samePseudo(r && r.player, currentUser) || samePseudo(r && r.createdBy, currentUser);
  }

  function clampNonNegativeInt(raw) {
    const n = Math.floor(Number(raw || 0));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function queuePendingCommerceFill(payload) {
    if (!payload) return;
    try {
      localStorage.setItem(
        STORAGE_KEYS.pendingCommerceFill,
        JSON.stringify({
          recipient: String(payload.recipient || ""),
          apples: clampNonNegativeInt(payload.apples),
          wood: clampNonNegativeInt(payload.wood),
          expiresAt: Date.now() + 3 * 60 * 1000
        })
      );
    } catch (e) {}
  }

  function queuePendingConvoyMatch(payload) {
    if (!payload || !payload.requestId) return;
    try {
      localStorage.setItem(
        STORAGE_KEYS.pendingConvoyMatch,
        JSON.stringify({
          requestId: String(payload.requestId),
          recipient: String(payload.recipient || ""),
          wood: clampNonNegativeInt(payload.wood),
          apples: clampNonNegativeInt(payload.apples),
          createdAt: Date.now(),
          expiresAt: Date.now() + 10 * 60 * 1000
        })
      );
    } catch (e) {}
  }

  function consumePendingConvoyMatch(recipientNorm) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.pendingConvoyMatch) || "";
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (!item || Number(item.expiresAt || 0) < Date.now()) {
        localStorage.removeItem(STORAGE_KEYS.pendingConvoyMatch);
        return null;
      }
      if (recipientNorm && normalizePseudo(item.recipient) !== recipientNorm) {
        return null;
      }
      localStorage.removeItem(STORAGE_KEYS.pendingConvoyMatch);
      return item;
    } catch (e) {
      return null;
    }
  }

  function fillCommerceFormFields({ recipient, apples, wood }) {
    if (!IS_COMMERCE) return { filledCount: 0, totalVisibleFields: 0 };

    const isVisibleField = (el) => {
      if (!el || (el.closest && (el.closest("#fmz-gb-root") || el.closest("#fmz-gb-left-dock")))) return false;
      const type = String(el.type || "").toLowerCase();
      if (["hidden", "submit", "button", "checkbox", "radio", "reset", "file", "image"].includes(type)) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const dispatchChange = (el) => {
      if (!el) return;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const writeField = (el, val) => {
      if (!el || val === undefined || val === null || val === "") return false;
      const strVal = String(val);
      if (el.tagName === "SELECT") {
        const target = strVal.trim().toLowerCase();
        const opt = Array.from(el.options).find(
          (o) =>
            String(o.value || "").trim().toLowerCase() === target ||
            String(o.textContent || "").trim().toLowerCase().includes(target)
        );
        if (opt) {
          el.value = opt.value;
          dispatchChange(el);
          return true;
        }
        return false;
      }
      el.focus();
      el.value = strVal;
      dispatchChange(el);
      return true;
    };

    const fields = Array.from(document.querySelectorAll("input, select")).filter(isVisibleField);
    const recipientEl = fields[1] || null;
    const applesEl = fields[2] || null;
    const woodEl = fields[3] || null;

    let filledCount = 0;
    if (recipient && writeField(recipientEl, recipient)) filledCount++;
    if (Number(apples) > 0 && writeField(applesEl, Math.floor(Number(apples)))) filledCount++;
    if (Number(wood) > 0 && writeField(woodEl, Math.floor(Number(wood)))) filledCount++;

    return {
      filledCount,
      totalVisibleFields: fields.length
    };
  }

  function consumePendingCommerceFillIfNeeded() {
    if (!IS_COMMERCE) return;
    let raw = "";
    try {
      raw = localStorage.getItem(STORAGE_KEYS.pendingCommerceFill) || "";
    } catch (e) {}
    if (!raw) return;

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {}

    try {
      localStorage.removeItem(STORAGE_KEYS.pendingCommerceFill);
    } catch (e) {}

    if (!data || Number(data.expiresAt || 0) < Date.now()) return;

    const tryFill = () => {
      const res = fillCommerceFormFields(data);
      if (res && res.filledCount > 0) {
        lastCommerceMessage = `✓ Champs pré-remplis pour ${data.recipient || "destinataire"} (🪵 ${formatNumber(data.wood)} · 🍎 ${formatNumber(data.apples)}).`;
        renderGlobalBubble();
      }
    };

    tryFill();
    setTimeout(tryFill, 250);
  }

  function extractOngoingConvoysFromCommercePage() {
    if (!IS_COMMERCE || !document.body) return [];
    const now = Date.now();
    const senderName = getDevUser();
    const existingArrivals = readCleanTimedArray(STORAGE_KEYS.movements, now)
      .filter((m) => m && m.type === "convoy")
      .map((m) => m.arrivalAt);

    const fullText = document.body.innerText || "";
    const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed = [];
    const seenKeys = new Set();

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].replace(/^-+\s*/, "");
      if (!/(?:vous\s+allez\s+livrer|convoi\s+vers|livraison\s+(?:vers|à|a))/i.test(line)) continue;

      if (!/\bdans\s+/i.test(line) && i + 1 < lines.length && /\bdans\s+/i.test(lines[i + 1])) {
        line = `${line} ${lines[i + 1].trim()}`;
      }

      const remSec = parseRemainingSeconds(line);
      if (remSec === null || remSec <= 0) continue;

      const m = line.match(
        /(?:vous\s+allez\s+livrer|livraison)\s+(.+?)\s+(?:à|a|vers)\s+([^\s]+(?:\s+[^\s]+)*?)\s+dans\s+/i
      );
      if (!m) continue;

      const resPart = m[1];
      const destRaw = m[2].trim();
      const destNorm = normalizePseudo(destRaw);
      if (!destNorm) continue;

      const appleMatch = resPart.match(/([\d\s\u00a0.,]+)\s*(?:🍎|pommes?|nourriture)/i);
      const woodMatch = resPart.match(/([\d\s\u00a0.,]+)\s*(?:🪵|bois|mat[ée]riaux?)/i);

      let apples = appleMatch ? (parseFrInt(appleMatch[1]) || 0) : 0;
      let wood = woodMatch ? (parseFrInt(woodMatch[1]) || 0) : 0;

      if (apples === 0 && wood === 0) {
        const nums = Array.from(resPart.matchAll(/\d{1,3}(?:[\s\u00a0]\d{3})+|\d+/g))
          .map((x) => parseFrInt(x[0]) || 0)
          .filter((n) => n > 0);
        if (nums.length >= 2) {
          apples = nums[0];
          wood = nums[1];
        } else if (nums.length === 1) {
          apples = nums[0];
        }
      }

      if (apples <= 0 && wood <= 0) continue;

      const arrivalAt = computeArrivalTimestamp(remSec, now, existingArrivals);
      const minuteBucket = Math.round(arrivalAt / 60000);
      const dedupeKey = `${normalizePseudo(senderName)}|${destNorm}|${wood}|${apples}|${minuteBucket}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const id = `cv_${normalizePseudo(senderName)}_${destNorm}_${apples}_${wood}_${minuteBucket}`;

      parsed.push({
        id,
        type: "convoy",
        from: findPlayerByPseudo(senderName) || { name: senderName, x: 0, y: 0, va: 0 },
        to: findPlayerByPseudo(destRaw) || { name: destRaw, x: 0, y: 0, va: 0 },
        duration: remSec,
        startAt: now,
        arrivalAt,
        wood,
        apples,
        createdBy: senderName
      });
    }

    return parsed;
  }

  function reconcileCommerceConvoys() {
    if (!IS_COMMERCE) return;
    const now = Date.now();
    const senderName = getDevUser();
    const senderNorm = normalizePseudo(senderName);
    const detected = extractOngoingConvoysFromCommercePage();
    if (!detected.length) {
      lastCommerceSnapshotKey = "";
      return;
    }

    const movements = readCleanTimedArray(STORAGE_KEYS.movements, now);
    const byKey = new Map(movements.map((m) => [convoyDedupeKey(m), m]));
    const newlyDetected = [];

    for (const cv of detected) {
      const key = convoyDedupeKey(cv);
      const prevSame = byKey.get(key);
      if (prevSame) {
        cv.id = prevSame.id;
        cv.arrivalAt = prevSame.arrivalAt;
        cv.requestId = prevSame.requestId || "";
        byKey.set(key, { ...prevSame, ...cv });
      } else {
        byKey.set(key, cv);
        newlyDetected.push(cv);
      }
    }

    const dedupedMovements = Array.from(byKey.values());
    writeJsonArray(STORAGE_KEYS.movements, dedupedMovements);

    let requestsChanged = false;
    for (const cv of newlyDetected) {
      const destNorm = normalizePseudo(cv.to && cv.to.name);
      const pendingMatch = consumePendingConvoyMatch(destNorm);

      let matchingReq = null;
      if (pendingMatch && pendingMatch.requestId) {
        matchingReq = convoyRequests.find(
          (r) => r && r.id === pendingMatch.requestId && r.status !== "done" && !isOwnRequest(r, senderName)
        );
      }

      if (!matchingReq) {
        matchingReq = convoyRequests
          .filter((r) => r && r.status !== "done" && normalizePseudo(r.player) === destNorm && !isOwnRequest(r, senderName))
          .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
          .find((r) => {
            const rem = reqRemaining(r);
            const hasResource = cv.wood > 0 || cv.apples > 0;
            const okWood = cv.wood > 0 ? rem.wood > 0 : true;
            const okApples = cv.apples > 0 ? rem.apples > 0 : true;
            return hasResource && okWood && okApples;
          });
      }

      if (matchingReq) {
        const remBefore = reqRemaining(matchingReq);
        const appliedWood = cv.wood > 0 ? Math.min(remBefore.wood, cv.wood) : 0;
        const appliedApples = cv.apples > 0 ? Math.min(remBefore.apples, cv.apples) : 0;

        cv.requestId = matchingReq.id;
        const delivery = {
          by: senderName,
          loggedBy: senderName,
          wood: appliedWood > 0 ? appliedWood : cv.wood,
          apples: appliedApples > 0 ? appliedApples : cv.apples,
          at: now,
          arrivalAt: cv.arrivalAt,
          movementId: cv.id
        };
        matchingReq.deliveries.push(delivery);

        const leftAfter = reqRemaining(matchingReq);
        if (leftAfter.wood <= 0 && leftAfter.apples <= 0) {
          matchingReq.status = "done";
          matchingReq.doneAt = now;
        }
        delete convoyDrafts[matchingReq.id];
        requestsChanged = true;
        syncWithWorker(
          {
            kind: "requests",
            action: "deliver",
            id: matchingReq.id,
            status: matchingReq.status,
            delivery
          },
          false
        );
      }

      const alreadyLogged = convoyLog.some(
        (item) =>
          normalizePseudo(item.from) === senderNorm &&
          normalizePseudo(item.to) === destNorm &&
          Number(item.wood || 0) === Number(cv.wood || 0) &&
          Number(item.apples || 0) === Number(cv.apples || 0) &&
          Math.abs(Number(item.arrivalAt || 0) - Number(cv.arrivalAt || 0)) <= 180000
      );
      if (!alreadyLogged) {
        convoyLog.push({
          from: senderName,
          to: (cv.to && cv.to.name) || "Destinataire",
          wood: cv.wood,
          apples: cv.apples,
          requestId: cv.requestId || "",
          arrivalAt: cv.arrivalAt
        });
      }
      syncWithWorker({ kind: "movements", action: "create", movement: cv }, `convoy_${key}`);
    }

    if (newlyDetected.length > 0) {
      saveConvoyLog();
      if (requestsChanged) {
        saveConvoyRequestsLocal();
      }
      lastCommerceMessage = `✓ ${newlyDetected.length} convoi(s) importé(s) depuis la page Commerce.`;
    }

    const snapshotKey = detected.map((c) => convoyDedupeKey(c)).sort().join("||");
    if (newlyDetected.length > 0 || snapshotKey !== lastCommerceSnapshotKey) {
      lastCommerceSnapshotKey = snapshotKey;
      showArmeeImportedBubble("Convois importés");
    }
  }

  function createConvoyRequest({ wood, apples, note }) {
    const cleanWood = clampNonNegativeInt(wood);
    const cleanApples = clampNonNegativeInt(apples);
    const cleanNote = String(note || "").trim();
    if (cleanWood <= 0 && cleanApples <= 0) {
      return { ok: false, message: "⚠️ Indique du bois et/ou des pommes." };
    }
    if (!cleanNote) {
      return { ok: false, message: "⚠️ Le motif est obligatoire." };
    }
    const devUser = getDevUser();
    const newReq = {
      id: Date.now() + "_" + Math.floor(Math.random() * 1e6),
      player: devUser,
      wood: cleanWood,
      apples: cleanApples,
      note: cleanNote,
      status: "open",
      deliveries: [],
      createdAt: Date.now(),
      createdBy: devUser
    };
    convoyRequests.push(newReq);
    saveConvoyRequestsLocal();
    syncWithWorker({ kind: "requests", action: "create", request: newReq }, false);
    return { ok: true, message: "✓ Demande de convoi enregistrée." };
  }

  function prepareConvoyDelivery({ requestId, rawWood, rawApples, redirectToCommerce = false }) {
    const r = convoyRequests.find((item) => item.id === requestId);
    if (!r) return { ok: false, message: "⚠️ Demande introuvable." };

    const devUser = getDevUser();
    if (isOwnRequest(r, devUser)) {
      return { ok: false, message: "🔒 Vous ne pouvez pas livrer votre propre demande." };
    }

    const rem = reqRemaining(r);
    const wVal = clampNonNegativeInt(rawWood);
    const aVal = clampNonNegativeInt(rawApples);

    if (wVal > rem.wood || aVal > rem.apples) {
      return {
        ok: false,
        message: `⚠️ Max restant : 🪵 ${formatNumber(rem.wood)} · 🍎 ${formatNumber(rem.apples)}.`
      };
    }

    const wood = Math.min(rem.wood, wVal);
    const apples = Math.min(rem.apples, aVal);

    if (wood <= 0 && apples <= 0) {
      return { ok: false, message: "⚠️ Indique une quantité supérieure à 0." };
    }

    const destName = r.player;
    queuePendingConvoyMatch({ requestId: r.id, recipient: destName, wood, apples });

    if (IS_COMMERCE) {
      fillCommerceFormFields({ recipient: destName, apples, wood });
      return {
        ok: true,
        message: `✓ Champs pré-remplis pour ${destName}. Valide l'envoi sur Fourmizzz pour clôturer la demande.`
      };
    }

    if (redirectToCommerce) {
      queuePendingCommerceFill({ recipient: destName, apples, wood });
      window.location.href = "/commerce.php";
      return { ok: true, redirected: true, message: "🚚 Redirection vers Commerce…" };
    }

    return {
      ok: true,
      message: `✓ Convoi préparé vers ${destName}.`
    };
  }
  function injectGlobalBubbleStyles() {
    if (!document.body && !document.head) return;
    if (document.getElementById("fmz-global-bubble-style")) return;
    const style = document.createElement("style");
    style.id = "fmz-global-bubble-style";
    style.textContent = `
      @keyframes fmzUpdateBlink {
        0%, 100% {
          background:#991b1b;
          border-color:#f87171;
          color:#ffffff;
          box-shadow:0 0 12px rgba(239,68,68,.85);
        }
        50% {
          background:#ef4444;
          border-color:#fecaca;
          color:#ffffff;
          box-shadow:0 0 20px rgba(248,113,113,1);
        }
      }
      #fmz-gb-left-dock{
        position:fixed;left:12px;bottom:14px;z-index:10000;
        display:flex;flex-direction:column;align-items:flex-start;gap:6px;
        font-family:Arial,sans-serif;font-size:12px;color:#f3f4f6;
      }
      #fmz-gb-root{
        position:fixed;right:12px;bottom:14px;z-index:10000;
        display:flex;flex-direction:column;align-items:flex-end;gap:8px;
        font-family:Arial,sans-serif;font-size:12px;color:#f3f4f6;
      }
      #fmz-gb-root.has-armee-badge #fmz-gb-card{margin-bottom:44px}
      #fmz-gb-root *, #fmz-gb-left-dock *{box-sizing:border-box}
      .fmz-gb-dock{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .fmz-gb-fab{
        display:inline-flex;align-items:center;gap:6px;text-decoration:none;
        background:#1f2937;color:#f9fafb;border:1px solid #4b5563;
        border-radius:999px;padding:7px 11px;cursor:pointer;
        font-weight:bold;font-size:12px;box-shadow:0 6px 18px rgba(0,0,0,.5);
        user-select:none;
      }
      .fmz-gb-fab:hover{background:#374151;color:#fff}
      .fmz-gb-fab.alert{
        background:#7f1d1d;border-color:#ef4444;color:#fff;
      }
      .fmz-gb-fab.convoy.active, .fmz-gb-fab.alliance.active, .fmz-gb-fab.stats.active, .fmz-gb-fab.players.active{
        background:#1e3a8a;border-color:#60a5fa;color:#fff;
      }
      .fmz-gb-fab.update{
        background:#14532d;border-color:#22c55e;color:#dcfce7;
      }
      .fmz-gb-fab.update:hover{background:#166534;color:#fff}
      .fmz-gb-fab.update.needs-update{
        animation:fmzUpdateBlink 1s infinite ease-in-out;
      }
      .fmz-gb-pill{
        background:#111827;border:1px solid #4b5563;border-radius:999px;
        padding:1px 6px;font-size:11px;color:#93c5fd;
      }
      .fmz-gb-fab.alert .fmz-gb-pill{
        background:#450a0a;border-color:#fca5a5;color:#fecaca;
      }
      #fmz-gb-card, .fmz-gb-card{
        width:min(368px, calc(100vw - 24px));
        max-height:calc(100vh - 125px);
        overflow-y:auto;
        background:#1f2937 !important;
        color:#f3f4f6 !important;
        opacity:1 !important;
        border:1px solid #4b5563;
        border-radius:12px;
        padding:10px;
        box-shadow:0 10px 28px rgba(0,0,0,.75);
      }
      .fmz-gb-head{
        display:flex;justify-content:space-between;align-items:center;
        gap:6px;padding-bottom:7px;margin-bottom:8px;border-bottom:1px solid #374151;
      }
      .fmz-gb-head b{font-size:13px;color:#fff}
      .fmz-gb-head-actions{display:flex;gap:4px;align-items:center}
      .fmz-gb-btn{
        background:#374151 !important;color:#fff !important;border:1px solid #6b7280;
        border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;font-weight:bold;
      }
      .fmz-gb-btn.primary{
        background:#166534 !important;border-color:#22c55e;color:#fff !important;
      }
      .fmz-gb-btn.accent{
        background:#1e3a8a !important;border-color:#3b82f6;color:#fff !important;
      }
      .fmz-gb-filters{
        display:flex;gap:4px;margin-bottom:6px;
      }
      .fmz-gb-filter-btn{
        flex:1;background:#111827 !important;color:#cbd5e1 !important;
        border:1px solid #374151;border-radius:6px;padding:4px 6px;
        cursor:pointer;font-size:11px;font-weight:bold;text-align:center;
      }
      .fmz-gb-filter-btn.active{
        background:#1e3a8a !important;color:#fff !important;border-color:#60a5fa;
      }
      .fmz-gb-status-bar{
        display:flex;justify-content:space-between;align-items:center;gap:6px;
        font-size:11px;color:#9ca3af;margin-bottom:8px;padding:0 2px;
      }
      .fmz-gb-link{color:#93c5fd;text-decoration:none;font-weight:bold}
      .fmz-gb-account-box{
        background:#111827;border:1px solid #4b5563;border-radius:8px;
        padding:8px;margin-bottom:8px;
      }
      .fmz-gb-account-row{display:flex;gap:6px;margin-top:6px}
      .fmz-gb-account-input{
        flex:1;background:#1f2937;color:#fff;border:1px solid #6b7280;
        border-radius:6px;padding:4px 7px;font-size:12px;
      }
      .fmz-gb-sec{
        background:#111827;border:1px solid #374151;border-radius:8px;
        padding:7px 8px;margin-bottom:7px;
      }
      .fmz-gb-sec:last-child{margin-bottom:0}
      .fmz-gb-sec.danger{border-left:3px solid #ef4444}
      .fmz-gb-sec.urgent{border-color:#ef4444;background:#231318}
      .fmz-gb-sec.in{border-left:3px solid #22c55e}
      .fmz-gb-sec.hunt{border-left:3px solid #f59e0b}
      .fmz-gb-sec.out{border-left:3px solid #3b82f6}
      .fmz-gb-sec-title{
        display:flex;justify-content:space-between;align-items:center;
        font-weight:bold;font-size:12px;color:#e5e7eb;
        cursor:pointer;user-select:none;
      }
      .fmz-gb-sec-body{margin-top:5px}
      .fmz-gb-sec.collapsed .fmz-gb-sec-body{display:none}
      .fmz-gb-row{padding:6px 4px;border-top:1px solid #1f2937;line-height:1.3}
      .fmz-gb-row.soon{background:rgba(239,68,68,.12);padding:6px 6px;border-radius:6px}
      .fmz-gb-row.targeted-me{border-left:2px solid #f87171;padding-left:6px}
      .fmz-gb-row.will-fail{background:rgba(245,158,11,.14);border-left:2px solid #f59e0b;padding:6px 6px;border-radius:6px}
      .fmz-gb-row:first-of-type{border-top:none;padding-top:2px}
      .fmz-gb-row-top{display:flex;justify-content:space-between;align-items:center;gap:6px}
      .fmz-gb-cd{white-space:nowrap;font-weight:bold;font-size:11px;color:#93c5fd}
      .fmz-gb-cd.critical{color:#fca5a5;background:#7f1d1d;padding:1px 5px;border-radius:4px}
      .fmz-gb-cd.warn{color:#fde68a}
      .fmz-gb-sub{color:#9ca3af;font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .fmz-gb-tdc{color:#cbd5e1;font-size:11px;margin-top:2px}
      .fmz-gb-rule{color:#86efac;font-size:11px;margin-top:2px}
      .fmz-gb-fail{color:#fbbf24;font-size:11px;font-weight:bold;margin-top:2px}
      .fmz-gb-empty{color:#9ca3af;font-size:11px}
      .fmz-gb-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:5px}
      .fmz-gb-lbl{display:block;color:#9ca3af;font-size:11px;margin-top:5px}
      .fmz-gb-inp{
        width:100%;background:#1f2937;color:#fff;border:1px solid #4b5563;
        border-radius:6px;padding:5px 7px;font-size:12px;margin-top:2px;
      }
      .fmz-gb-actions{display:flex;gap:6px;margin-top:6px}
      .fmz-gb-actions button{flex:1}
      .fmz-gb-msg{margin-top:6px;font-size:11px;color:#86efac}
      .fmz-gb-msg.warn{color:#fca5a5}
      .fmz-gb-player{
        display:flex;justify-content:space-between;align-items:center;gap:6px;
        width:100%;background:#111827 !important;color:#f3f4f6 !important;
        border:1px solid #374151;border-radius:6px;padding:6px 8px;margin-bottom:4px;
        cursor:pointer;font-size:12px;text-align:left;
      }
      .fmz-gb-player:hover{background:#1f2937 !important;border-color:#60a5fa}
      .fmz-gb-player.me{border-left:3px solid #22c55e}
      .fmz-gb-player.attacked{border-left:3px solid #ef4444}
      .fmz-gb-player-tdc{color:#9ca3af;font-size:11px;margin-left:6px}
      .fmz-gb-badge{
        background:#374151;color:#e5e7eb;border-radius:999px;
        padding:1px 7px;font-size:11px;font-weight:bold;min-width:22px;text-align:center;
      }
      .fmz-gb-badge.alert{background:#7f1d1d;color:#fecaca;border:1px solid #ef4444}
      .fmz-gb-summary{
        background:#111827;border:1px solid #374151;border-radius:8px;
        padding:7px 8px;margin-bottom:7px;font-size:11px;line-height:1.5;color:#cbd5e1;
      }
    `;
    (document.head || document.body).appendChild(style);
  }

  function ensureContainersAttached() {
    if (!document.body) return false;

    let leftDock = document.getElementById("fmz-gb-left-dock");
    if (!leftDock) {
      leftDock = document.createElement("div");
      leftDock.id = "fmz-gb-left-dock";
      document.body.appendChild(leftDock);
    } else if (!document.body.contains(leftDock)) {
      document.body.appendChild(leftDock);
    }

    let root = document.getElementById("fmz-gb-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "fmz-gb-root";
      document.body.appendChild(root);
    } else if (!document.body.contains(root)) {
      document.body.appendChild(root);
    }

    if (IS_ATTACK_PAGE || IS_COMMERCE) {
      ensureArmeeIndicator();
    }

    return true;
  }

  function renderSectionBlock(key, title, count, bodyHtml, extraClass = "", collapsed = false) {
    const arrow = collapsed ? "▸" : "▾";
    return `
      <div class="fmz-gb-sec ${extraClass} ${collapsed ? "collapsed" : ""}" data-sec="${esc(key)}">
        <div class="fmz-gb-sec-title" data-toggle-sec="${esc(key)}">
          <span>${arrow} ${title}</span>
          <span>${count}</span>
        </div>
        <div class="fmz-gb-sec-body">${bodyHtml}</div>
      </div>
    `;
  }

  function sanitizeRankingItems(rawList, fallbackPlayers) {
    const cleaned = [];
    const seen = new Set();

    if (Array.isArray(rawList)) {
      for (const item of rawList) {
        if (!item || typeof item !== "object") continue;
        const pName = playerDisplayName(String(item.name || item.pseudo || item.player || "").trim());
        if (!isCleanPlayerName(pName) || !isKnownAllianceMemberName(pName)) continue;
        const pVal = item.tdc ?? item.terrain ?? item.value ?? item.score ?? 0;
        const numVal = parseLeadingFrNumber(pVal);
        if (numVal !== null && numVal > 0) {
          const key = normalizePseudo(pName);
          if (!seen.has(key)) {
            seen.add(key);
            cleaned.push({ name: pName, tdc: Math.floor(numVal) });
          }
        }
      }
    }

    if (cleaned.length > 0) {
      return cleaned.sort((a, b) => b.tdc - a.tdc);
    }

    return fallbackPlayers || [];
  }

  function buildStatsBubbleHtml(devUser, now, collapsedMap) {
    const stats = readAllianceStats();
    const tdcMap = readAllianceTdcMap();
    const playersFromMap = Object.entries(tdcMap)
      .filter(
        ([k, v]) =>
          k &&
          !k.startsWith("_") &&
          LDDLP_KEYS.has(normalizePseudo(k)) &&
          v &&
          typeof v.tdc === "number" &&
          v.tdc > 0 &&
          isCleanPlayerName(v.pseudo)
      )
      .map(([, v]) => ({ name: playerDisplayName(v.pseudo), tdc: Math.floor(v.tdc) }))
      .sort((a, b) => b.tdc - a.tdc);

    const totalTdcFromMap = playersFromMap.reduce((sum, p) => sum + p.tdc, 0);
    const avgTdcFromMap = playersFromMap.length ? Math.round(totalTdcFromMap / playersFromMap.length) : 0;

    const totalTdc = stats && (stats.totalTdc ?? stats.tdcTotal ?? stats.total_tdc) !== undefined
      ? parseLeadingFrNumber(stats.totalTdc ?? stats.tdcTotal ?? stats.total_tdc) || totalTdcFromMap
      : totalTdcFromMap;
    const avgTdc = stats && (stats.avgTdc ?? stats.tdcAvg ?? stats.averageTdc) !== undefined
      ? parseLeadingFrNumber(stats.avgTdc ?? stats.tdcAvg ?? stats.averageTdc) || avgTdcFromMap
      : avgTdcFromMap;
    const memberCount = stats && (stats.memberCount ?? stats.playersCount ?? stats.count) !== undefined
      ? parseLeadingFrNumber(stats.memberCount ?? stats.playersCount ?? stats.count) || playersFromMap.length
      : playersFromMap.length;

    const overviewRows = [];
    if (memberCount > 0) {
      overviewRows.push(`<div class="fmz-gb-row"><div class="fmz-gb-row-top"><span>👥 Membres ${OWN_ALLIANCE_TAG}</span><b>${formatNumber(memberCount)}</b></div></div>`);
    }
    if (totalTdc > 0) {
      overviewRows.push(`<div class="fmz-gb-row"><div class="fmz-gb-row-top"><span>📐 TDC total alliance</span><b>${formatNumber(totalTdc)} cm²</b></div></div>`);
    }
    if (avgTdc > 0) {
      overviewRows.push(`<div class="fmz-gb-row"><div class="fmz-gb-row-top"><span>📊 TDC moyen</span><b>${formatNumber(avgTdc)} cm²</b></div></div>`);
    }

    const overviewHtml = overviewRows.length
      ? overviewRows.join("")
      : `<div class="fmz-gb-empty">Aucune statistique ${OWN_ALLIANCE_TAG} disponible (ouvre la page Membres de l'alliance).</div>`;

    const rawRanking =
      (stats && Array.isArray(stats.topPlayers) && stats.topPlayers) ||
      (stats && Array.isArray(stats.ranking) && stats.ranking) ||
      (stats && Array.isArray(stats.items) && stats.items) ||
      [];

    const rankingList = sanitizeRankingItems(rawRanking, playersFromMap);

    const rankingHtml = !rankingList.length
      ? `<div class="fmz-gb-empty">Aucun classement ${OWN_ALLIANCE_TAG} disponible (ouvre la page Membres).</div>`
      : rankingList
          .map((item, idx) => `
            <div class="fmz-gb-row">
              <div class="fmz-gb-row-top">
                <span><b>${idx + 1}. ${esc(item.name)}</b></span>
                <span class="fmz-gb-cd">${formatNumber(item.tdc)} cm²</span>
              </div>
            </div>
          `)
          .join("");

    return `
      <div id="fmz-gb-card">
        <div class="fmz-gb-head">
          <b>📊 Statistiques ${OWN_ALLIANCE_TAG} · ${esc(devUser)}</b>
          <div class="fmz-gb-head-actions">
            <button id="fmz-gb-refresh" class="fmz-gb-btn" type="button" title="Rafraîchir maintenant">🔄</button>
            <button id="fmz-gb-st-close" class="fmz-gb-btn" type="button" title="Réduire">_</button>
          </div>
        </div>

        <div class="fmz-gb-status-bar">
          <span>${esc(syncStatus.label)}</span>
          <a class="fmz-gb-link" href="${esc(SHORTCUT_LINKS.membersUrl)}">📋 Membres ${OWN_ALLIANCE_TAG}</a>
        </div>

        ${renderSectionBlock(
          "st_overview",
          `📈 Synthèse ${OWN_ALLIANCE_TAG}`,
          overviewRows.length,
          overviewHtml,
          "in",
          !!collapsedMap.st_overview
        )}

        ${renderSectionBlock(
          "st_ranking",
          `🏆 Classement TDC ${OWN_ALLIANCE_TAG}`,
          rankingList.length,
          rankingHtml,
          "out",
          !!collapsedMap.st_ranking
        )}
      </div>
    `;
  }

  function buildAllianceBubbleHtml(devUser, now, collapsedMap) {
    const rawAttacks = getAllAllianceAttacks(now);
    const incomingCount = rawAttacks.filter((a) => samePseudo(a.target, devUser)).length;
    const outgoingCount = rawAttacks.filter((a) => samePseudo(a.attacker, devUser)).length;
    const filteredAttacks = rawAttacks
      .filter((a) => {
        if (allianceAttackFilter === "incoming") return samePseudo(a.target, devUser);
        if (allianceAttackFilter === "outgoing") return samePseudo(a.attacker, devUser);
        return true;
      })
      .sort((a, b) => {
        if (allianceAttackSort === "tdc") {
          const evA = getAttackEvaluation(a);
          const evB = getAttackEvaluation(b);
          const impactA = evA.willFail ? 0 : (evA.taken || 0);
          const impactB = evB.willFail ? 0 : (evB.taken || 0);
          if (impactB !== impactA) return impactB - impactA;
        }
        return Number(a.arrivalAt || 0) - Number(b.arrivalAt || 0);
      });

    const hasUrgent = filteredAttacks.some((a) => (Number(a.arrivalAt || 0) - now) <= 30 * 60 * 1000);

    const attacksListHtml = !filteredAttacks.length
      ? `<div class="fmz-gb-empty">Aucune attaque correspondant à ce filtre.</div>`
      : filteredAttacks
          .map((a) => {
            const leftSec = Math.max(0, Math.ceil((Number(a.arrivalAt || 0) - now) / 1000));
            const isCritical = leftSec <= 15 * 60;
            const isWarn = leftSec <= 30 * 60;
            const urgencyClass = isCritical ? "critical" : isWarn ? "warn" : "";
            const isMeTarget = samePseudo(a.target, devUser);
            const targetBadge = isMeTarget
              ? `<span style="color:#fca5a5;font-weight:bold">${esc(a.target || "?")} (moi)</span>`
              : `<b>${esc(a.target || "?")}</b>`;

            const sentAnts = getAttackSentAnts(a);
            const atkTdc = getAttackerTdcSummary(a);
            const defTdc = getAttackTdcSummary(a);
            const willFail = defTdc.willFail;

            const metaParts = [];
            const arrivalTxt = a.arrivalLabel
              ? esc(a.arrivalLabel)
              : new Date(Number(a.arrivalAt || now)).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
            metaParts.push(`🕒 ${arrivalTxt}`);
            if (a.targetKind) metaParts.push(esc(a.targetKind));
            metaParts.push(sentAnts > 0 ? `🐜 ${formatNumber(sentAnts)}` : `🐜 effectif inconnu`);

            const tdcParts = [];
            if (atkTdc.hasTdc) {
              tdcParts.push(
                !willFail && atkTdc.taken > 0
                  ? `${esc(a.attacker || "Attaquant")} ${formatNumber(atkTdc.beforeTdc)}→${formatNumber(atkTdc.afterTdc)}`
                  : `${esc(a.attacker || "Attaquant")} ${formatNumber(atkTdc.beforeTdc)}`
              );
            }
            if (defTdc.hasTdc) {
              const defLabel = isMeTarget ? "Moi" : esc(a.target || "Cible");
              tdcParts.push(
                !willFail && defTdc.taken > 0
                  ? `${defLabel} ${formatNumber(defTdc.beforeTdc)}→${formatNumber(defTdc.afterTdc)}`
                  : `${defLabel} ${formatNumber(defTdc.beforeTdc)}`
              );
            }
            const tdcSub = tdcParts.length
              ? `<div class="fmz-gb-tdc">📐 ${tdcParts.join(" · ")} cm²</div>`
              : "";

            let ruleLine = "";
            if (willFail) {
              ruleLine = `<div class="fmz-gb-fail">⚠️ Hors plage 50%–300% (0 cm² pris) : ${esc(defTdc.failReason)}</div>`;
            } else if (defTdc.hasTdc) {
              const ratioTxt = defTdc.ratioPct != null ? ` · ratio ${defTdc.ratioPct}%` : "";
              ruleLine = `<div class="fmz-gb-rule">🎯 Prise max : <b>${formatNumber(defTdc.taken)} cm²</b> (20% cible / effectif${ratioTxt})</div>`;
            }

            return `
              <div class="fmz-gb-row ${isWarn ? "soon" : ""} ${isMeTarget ? "targeted-me" : ""} ${willFail ? "will-fail" : ""}">
                <div class="fmz-gb-row-top">
                  <span>${willFail ? "⚠️" : isCritical ? "🚨" : "⚔️"} <b>${esc(a.attacker || "Inconnu")}</b> → ${targetBadge}</span>
                  <span class="fmz-gb-cd ${urgencyClass}" data-cd="${a.arrivalAt}">${formatDuration(leftSec)}</span>
                </div>
                <div class="fmz-gb-sub">${metaParts.join(" · ")}</div>
                ${tdcSub}
                ${ruleLine}
              </div>
            `;
          })
          .join("");

    return `
      <div id="fmz-gb-card">
        <div class="fmz-gb-head">
          <b>🛡️ Alliance · Attaques en cours</b>
          <div class="fmz-gb-head-actions">
            <button id="fmz-gb-refresh" class="fmz-gb-btn" type="button" title="Rafraîchir maintenant">🔄</button>
            <button id="fmz-gb-al-close" class="fmz-gb-btn" type="button" title="Réduire">_</button>
          </div>
        </div>

        <div class="fmz-gb-status-bar">
          <span>${esc(syncStatus.label)}</span>
          <a class="fmz-gb-link" href="${esc(SHORTCUT_LINKS.membersUrl)}">📋 Membres (TDC)</a>
        </div>

        <div class="fmz-gb-filters">
          <button class="fmz-gb-filter-btn ${allianceAttackFilter === "all" ? "active" : ""}" data-al-filter="all" type="button">Tout (${rawAttacks.length})</button>
          <button class="fmz-gb-filter-btn ${allianceAttackFilter === "incoming" ? "active" : ""}" data-al-filter="incoming" type="button">Sur moi (${incomingCount})</button>
          <button class="fmz-gb-filter-btn ${allianceAttackFilter === "outgoing" ? "active" : ""}" data-al-filter="outgoing" type="button">Mes attaques (${outgoingCount})</button>
        </div>

        <div class="fmz-gb-filters">
          <button class="fmz-gb-filter-btn ${allianceAttackSort === "time" ? "active" : ""}" data-al-sort="time" type="button">⏱️ Tri : Arrivée</button>
          <button class="fmz-gb-filter-btn ${allianceAttackSort === "tdc" ? "active" : ""}" data-al-sort="tdc" type="button">📐 Tri : Impact TDC</button>
        </div>

        ${renderSectionBlock(
          "al_attacks",
          "⚔️ Attaques suivies",
          filteredAttacks.length,
          attacksListHtml,
          `danger ${hasUrgent ? "urgent" : ""}`,
          !!collapsedMap.al_attacks
        )}
      </div>
    `;
  }

  function buildConvoyBubbleHtml(devUser, now, collapsedMap) {
    const activeRequests = convoyRequests.filter((r) => r.status !== "done");
    const openCount = activeRequests.length;
    const partialRequests = activeRequests.filter((r) => isPartialRequest(r));
    const ongoingDirectConvoys = getOngoingDirectConvoys(now);
    const ongoingTotal = partialRequests.length + ongoingDirectConvoys.length;

    const toTreatHtml = !activeRequests.length
      ? `<div class="fmz-gb-empty">Aucune demande ouverte à traiter.</div>`
      : activeRequests
          .slice()
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((r) => {
            const rem = reqRemaining(r);
            const del = reqDelivered(r);
            const ownReq = isOwnRequest(r, devUser);
            const dr = convoyDrafts[r.id] || {};
            const wVal = dr.wood !== undefined ? dr.wood : rem.wood || 0;
            const aVal = dr.apples !== undefined ? dr.apples : rem.apples || 0;
            const hasDelivered = del.wood > 0 || del.apples > 0;
            const statusText = hasDelivered
              ? `Livré 🪵 ${formatNumber(del.wood)} · 🍎 ${formatNumber(del.apples)} / Reste 🪵 ${formatNumber(rem.wood)} · 🍎 ${formatNumber(rem.apples)}`
              : `Ouverte · Reste 🪵 ${formatNumber(rem.wood)} · 🍎 ${formatNumber(rem.apples)}`;

            const actionBlock = ownReq
              ? `<div class="fmz-gb-sub" style="color:#fca5a5">Votre demande personnelle</div>`
              : `
                <div class="fmz-gb-grid2">
                  ${
                    rem.wood > 0
                      ? `<div><label class="fmz-gb-lbl">🪵 Bois (reste ${formatNumber(rem.wood)})</label><input class="fmz-gb-inp" data-cv-df="wood" data-cv-did="${esc(r.id)}" data-cv-max="${rem.wood}" type="number" min="0" max="${rem.wood}" value="${esc(wVal)}"></div>`
                      : ""
                  }
                  ${
                    rem.apples > 0
                      ? `<div><label class="fmz-gb-lbl">🍎 Pommes (reste ${formatNumber(rem.apples)})</label><input class="fmz-gb-inp" data-cv-df="apples" data-cv-did="${esc(r.id)}" data-cv-max="${rem.apples}" type="number" min="0" max="${rem.apples}" value="${esc(aVal)}"></div>`
                      : ""
                  }
                </div>
                <div class="fmz-gb-actions">
                  <button class="fmz-gb-btn" data-cv-act="half" data-cv-id="${esc(r.id)}" type="button">50%</button>
                  <button class="fmz-gb-btn accent" data-cv-act="max" data-cv-id="${esc(r.id)}" type="button">Max</button>
                  <button class="fmz-gb-btn primary" data-cv-act="send" data-cv-id="${esc(r.id)}" type="button">🚚 Lancer</button>
                </div>
              `;

            return `
              <div class="fmz-gb-row" data-cv-card="${esc(r.id)}">
                <div class="fmz-gb-row-top">
                  <span><b>${esc(r.player)}</b> · 🪵 ${formatNumber(r.wood)} · 🍎 ${formatNumber(r.apples)}</span>
                </div>
                <div class="fmz-gb-tdc">${esc(statusText)}</div>
                ${r.note ? `<div class="fmz-gb-sub">${esc(r.note)}</div>` : ""}
                ${actionBlock}
              </div>
            `;
          })
          .join("");

    const partialRows = partialRequests
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => {
        const activeArr = getActiveDeliveryArrivalAt(r, now);
        const leftSec = activeArr > 0 ? Math.max(0, Math.ceil((activeArr - now) / 1000)) : 0;
        const cdHtml = activeArr > 0
          ? `<span class="fmz-gb-cd" data-cd="${activeArr}">${formatDuration(leftSec)}</span>`
          : `<span class="fmz-gb-cd">Partielle</span>`;
        return `
          <div class="fmz-gb-row">
            <div class="fmz-gb-row-top">
              <span><b>${esc(r.player)}</b> · 🪵 ${formatNumber(r.wood)} · 🍎 ${formatNumber(r.apples)}</span>
              ${cdHtml}
            </div>
          </div>
        `;
      });

    const convoyRows = ongoingDirectConvoys
      .sort((a, b) => Number(a.arrivalAt || 0) - Number(b.arrivalAt || 0))
      .map((m) => {
        const arrAt = Number(m.arrivalAt || 0);
        const leftSec = Math.max(0, Math.ceil((arrAt - now) / 1000));
        const fromName = (m.from && m.from.name) || m.createdBy || "Joueur";
        const toName = (m.to && m.to.name) || "Destinataire";
        return `
          <div class="fmz-gb-row">
            <div class="fmz-gb-row-top">
              <span><b>${esc(fromName)} → ${esc(toName)}</b> · 🪵 ${formatNumber(m.wood)} · 🍎 ${formatNumber(m.apples)}</span>
              <span class="fmz-gb-cd" data-cd="${arrAt}">${formatDuration(leftSec)}</span>
            </div>
          </div>
        `;
      });

    const ongoingHtml = partialRows.concat(convoyRows).join("") || `<div class="fmz-gb-empty">Aucun convoi en cours.</div>`;

    const newReqBodyHtml = `
      <div class="fmz-gb-grid2">
        <div><label class="fmz-gb-lbl">🪵 Bois</label><input class="fmz-gb-inp" id="fmz-cv-new-wood" type="number" min="0" placeholder="0"></div>
        <div><label class="fmz-gb-lbl">🍎 Pommes</label><input class="fmz-gb-inp" id="fmz-cv-new-apples" type="number" min="0" placeholder="0"></div>
      </div>
      <label class="fmz-gb-lbl">Motif</label>
      <input class="fmz-gb-inp" id="fmz-cv-new-note" type="text" maxlength="200" placeholder="Ex : construction / évolution">
      <div class="fmz-gb-actions">
        <button class="fmz-gb-btn primary" id="fmz-cv-add-req" type="button">📨 Envoyer la demande</button>
      </div>
      <div class="fmz-gb-msg ${lastCommerceMessage.startsWith("⚠️") || lastCommerceMessage.startsWith("🔒") ? "warn" : ""}" id="fmz-cv-msg">${esc(lastCommerceMessage)}</div>
    `;

    const logs = readJsonArray(STORAGE_KEYS.convoyLog).slice().reverse().slice(0, 10);
    const historyHtml = !logs.length
      ? `<div class="fmz-gb-empty">Aucun convoi dans l'historique.</div>`
      : logs
          .map((item) => {
            const inTransit = Number(item.arrivalAt || 0) > now;
            return `
              <div class="fmz-gb-row">
                <div class="fmz-gb-row-top">
                  <span><b>${esc(item.from || "Joueur")} → ${esc(item.to || "Destinataire")}</b> · 🪵 ${formatNumber(item.wood)} · 🍎 ${formatNumber(item.apples)}</span>
                  <span class="fmz-gb-cd">${inTransit ? "En route" : "Livré"}</span>
                </div>
              </div>
            `;
          })
          .join("");

    return `
      <div id="fmz-gb-card">
        <div class="fmz-gb-head">
          <b>🚚 Convois · ${esc(devUser)}</b>
          <div class="fmz-gb-head-actions">
            <button id="fmz-gb-refresh" class="fmz-gb-btn" type="button" title="Rafraîchir maintenant">🔄</button>
            <button id="fmz-gb-cv-close" class="fmz-gb-btn" type="button" title="Réduire">_</button>
          </div>
        </div>

        <div class="fmz-gb-status-bar">
          <span>${esc(syncStatus.label)}</span>
          <a class="fmz-gb-link" href="/commerce.php">Page Commerce</a>
        </div>

        ${renderSectionBlock(
          "cv_open",
          "📋 Demandes à traiter",
          openCount,
          toTreatHtml,
          "out",
          !!collapsedMap.cv_open
        )}

        ${renderSectionBlock(
          "cv_ongoing",
          "🚚 Convois en cours",
          ongoingTotal,
          ongoingHtml,
          "in",
          !!collapsedMap.cv_ongoing
        )}

        ${renderSectionBlock(
          "cv_new",
          "📬 Nouvelle demande",
          "",
          newReqBodyHtml,
          "hunt",
          !!collapsedMap.cv_new
        )}

        ${renderSectionBlock(
          "cv_hist",
          "📜 Historique",
          logs.length,
          historyHtml,
          "",
          collapsedMap.cv_hist !== undefined ? !!collapsedMap.cv_hist : true
        )}
      </div>
    `;
  }

  function bindConvoyBubbleEvents(root) {
    root.querySelectorAll("[data-cv-df]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const id = inp.dataset.cvDid;
        const maxVal = clampNonNegativeInt(inp.dataset.cvMax);
        let val = clampNonNegativeInt(inp.value);
        if (val > maxVal) {
          val = maxVal;
          inp.value = String(maxVal);
          lastCommerceMessage = `⚠️ Maximum : ${formatNumber(maxVal)}.`;
          const msgEl = root.querySelector("#fmz-cv-msg");
          if (msgEl) {
            msgEl.className = "fmz-gb-msg warn";
            msgEl.textContent = lastCommerceMessage;
          }
        }
        convoyDrafts[id] = convoyDrafts[id] || {};
        convoyDrafts[id][inp.dataset.cvDf] = val;
      });
    });

    const addReqBtn = root.querySelector("#fmz-cv-add-req");
    if (addReqBtn) {
      addReqBtn.onclick = () => {
        const res = createConvoyRequest({
          wood: root.querySelector("#fmz-cv-new-wood")?.value,
          apples: root.querySelector("#fmz-cv-new-apples")?.value,
          note: root.querySelector("#fmz-cv-new-note")?.value
        });
        lastCommerceMessage = res.message;
        renderGlobalBubble();
      };
    }

    root.querySelectorAll("button[data-cv-act]").forEach((btn) => {
      btn.onclick = () => {
        const r = convoyRequests.find((item) => item.id === btn.dataset.cvId);
        if (!r) return;
        const act = btn.dataset.cvAct;
        const rem = reqRemaining(r);
        if (act === "half") {
          convoyDrafts[r.id] = {
            wood: Math.floor(rem.wood * 0.5),
            apples: Math.floor(rem.apples * 0.5)
          };
          lastCommerceMessage = `✓ 50% du reste sélectionné pour ${r.player}.`;
          renderGlobalBubble();
        } else if (act === "max") {
          convoyDrafts[r.id] = { wood: rem.wood, apples: rem.apples };
          lastCommerceMessage = `✓ Max sélectionné pour ${r.player}.`;
          renderGlobalBubble();
        } else if (act === "send") {
          const card = btn.closest("[data-cv-card]");
          const wInp = card?.querySelector('[data-cv-df="wood"]');
          const aInp = card?.querySelector('[data-cv-df="apples"]');
          setConvoyBubbleOpen(false);
          renderGlobalBubble();
          prepareConvoyDelivery({
            requestId: r.id,
            rawWood: wInp ? wInp.value : 0,
            rawApples: aInp ? aInp.value : 0,
            redirectToCommerce: true
          });
        }
      };
    });
  }

  function playerDisplayName(raw) {
    return String(raw || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  }

  function getKnownPlayers(now) {
    const byKey = new Map();
    const tdcMap = readAllianceTdcMap();

    for (const p of DEFAULT_PLAYERS) {
      const display = playerDisplayName(p.name);
      const key = normalizePseudo(display);
      if (!key || !display || !LDDLP_KEYS.has(key)) continue;
      const storedEntry = tdcMap[key];
      const tdcVal =
        storedEntry && typeof storedEntry.tdc === "number" && storedEntry.tdc > 0
          ? Math.floor(storedEntry.tdc)
          : (typeof p.tdc === "number" && p.tdc > 0 ? Math.floor(p.tdc) : null);
      byKey.set(key, { key, name: display, tdc: tdcVal, count: 0, hunts: 0 });
    }

    getAllAllianceAttacks(now).forEach((a) => {
      const p = byKey.get(normalizePseudo(a.target));
      if (p) p.count++;
    });
    getAllActiveHunts(now).forEach((h) => {
      const p = byKey.get(normalizePseudo(h.player));
      if (p) p.hunts++;
    });

    return Array.from(byKey.values()).sort(
      (x, y) => y.count - x.count || y.hunts - x.hunts || x.name.localeCompare(y.name, "fr", { sensitivity: "base" })
    );
  }

  function buildPlayersBubbleHtml(devUser, now, collapsedMap) {
    const players = getKnownPlayers(now);
    const meKey = normalizePseudo(devUser);
    const selected = selectedPlayerKey ? players.find((p) => p.key === selectedPlayerKey) : null;

    if (selected) {
      const attacks = getAllAllianceAttacks(now).filter((a) => normalizePseudo(a.target) === selected.key);
      const hunts = getAllActiveHunts(now).filter((h) => normalizePseudo(h.player) === selected.key);
      const playerConvoys = getConvoySummaryForUser(selected.name, now);
      const sim = getTdcChains();
      const currentTdc = getPlayerTdc(selected.name);
      const projected = sim.finalTdc && sim.finalTdc.has(selected.key) ? sim.finalTdc.get(selected.key) : null;
      let totalTaken = 0;
      attacks.forEach((a) => {
        const ch = sim.attacks.get(String(a.sig || a.id));
        if (ch && !ch.willFail) {
          totalTaken += ch.taken || 0;
        }
      });

      const summaryHtml = `
        <div class="fmz-gb-summary">
          📐 TDC actuel : <b>${currentTdc ? formatNumber(currentTdc) + " cm²" : "inconnu"}</b>
          ${projected != null && (attacks.length || hunts.length) ? ` · après tous les mouvements : <b>${formatNumber(projected)} cm²</b>` : ""}<br>
          ⚔️ Attaques sur lui : <b>${attacks.length}</b> · 📉 TDC pris max (20%) : <b>${formatNumber(totalTaken)} cm²</b> · 🏹 Chasses : <b>${hunts.length}</b><br>
          🚚 Convois entrants : <b>${playerConvoys.incoming.length}</b> · sortants : <b>${playerConvoys.outgoing.length}</b>
        </div>
      `;

      const listHtml = !attacks.length
        ? `<div class="fmz-gb-empty">Aucune attaque en cours sur ${esc(selected.name)}.</div>`
        : attacks
            .map((a) => {
              const leftSec = Math.max(0, Math.ceil((Number(a.arrivalAt || 0) - now) / 1000));
              const isCritical = leftSec <= 15 * 60;
              const isWarn = leftSec <= 30 * 60;
              const urgencyClass = isCritical ? "critical" : isWarn ? "warn" : "";
              const sentAnts = getAttackSentAnts(a);
              const defTdc = getAttackTdcSummary(a);
              const atkTdc = getAttackerTdcSummary(a);
              const willFail = defTdc.willFail;
              const arrivalTxt = a.arrivalLabel
                ? esc(a.arrivalLabel)
                : new Date(Number(a.arrivalAt || now)).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
              const meta = [`🕒 ${arrivalTxt}`];
              if (a.targetKind) meta.push(esc(a.targetKind));
              meta.push(sentAnts > 0 ? `🐜 ${formatNumber(sentAnts)}` : "🐜 effectif inconnu");
              if (!willFail && defTdc.maxSteal20 != null) {
                meta.push(`max 20% : ${formatNumber(defTdc.maxSteal20)}`);
              }
              const tdcParts = [];
              if (defTdc.hasTdc) {
                tdcParts.push(
                  !willFail && defTdc.taken > 0
                    ? `${esc(selected.name)} ${formatNumber(defTdc.beforeTdc)}→${formatNumber(defTdc.afterTdc)}`
                    : `${esc(selected.name)} ${formatNumber(defTdc.beforeTdc)}`
                );
              }
              if (atkTdc.hasTdc) {
                tdcParts.push(
                  !willFail && atkTdc.taken > 0
                    ? `${esc(a.attacker || "Attaquant")} ${formatNumber(atkTdc.beforeTdc)}→${formatNumber(atkTdc.afterTdc)}`
                    : `${esc(a.attacker || "Attaquant")} ${formatNumber(atkTdc.beforeTdc)}`
                );
              }
              const tdcSub = tdcParts.length ? `<div class="fmz-gb-tdc">📐 ${tdcParts.join(" · ")} cm²</div>` : "";
              const failLine = willFail
                ? `<div class="fmz-gb-fail">⚠️ Échec prévu : ${esc(defTdc.failReason)}</div>`
                : "";
              return `
                <div class="fmz-gb-row ${isWarn ? "soon" : ""} ${willFail ? "will-fail" : ""}">
                  <div class="fmz-gb-row-top">
                    <span>${willFail ? "⚠️" : isCritical ? "🚨" : "⚔️"} <b>${esc(a.attacker || "Inconnu")}</b></span>
                    <span class="fmz-gb-cd ${urgencyClass}" data-cd="${a.arrivalAt}">${formatDuration(leftSec)}</span>
                  </div>
                  <div class="fmz-gb-sub">${meta.join(" · ")}</div>
                  ${tdcSub}
                  ${failLine}
                </div>
              `;
            })
            .join("");

      const huntsListHtml = !hunts.length
        ? `<div class="fmz-gb-empty">Aucune chasse en cours pour ${esc(selected.name)}.</div>`
        : hunts
            .slice()
            .sort((x, y) => Number(x.arrivalAt || 0) - Number(y.arrivalAt || 0))
            .map((h) => {
              const leftSec = Math.max(0, Math.ceil((Number(h.arrivalAt || 0) - now) / 1000));
              const tdcInfo = getHuntTdcSummary(h);
              const areaLabel = h.area ? ` · +${formatNumber(h.area)} cm²` : "";
              const tdcSub = tdcInfo.hasTdc
                ? `📐 TDC avant : <b>${formatNumber(tdcInfo.beforeTdc)}</b> · après chasse : <b>${formatNumber(tdcInfo.afterTdc)}</b>`
                : `📐 TDC inconnu`;
              return `
                <div class="fmz-gb-row">
                  <div class="fmz-gb-row-top">
                    <span>🏹 <b>${esc(selected.name)}</b>${areaLabel}</span>
                    <span class="fmz-gb-cd" data-cd="${h.arrivalAt}">${formatDuration(leftSec)}</span>
                  </div>
                  <div class="fmz-gb-tdc">${tdcSub}</div>
                </div>
              `;
            })
            .join("");

      const convoyInHtml = !playerConvoys.incoming.length
        ? `<div class="fmz-gb-empty">Aucun convoi entrant.</div>`
        : playerConvoys.incoming
            .map((c) => {
              const leftSec = Math.max(0, Math.ceil((c.arrivalAt - now) / 1000));
              return `
                <div class="fmz-gb-row">
                  <div class="fmz-gb-row-top">
                    <span>De <b>${esc(c.fromName)}</b> · 🪵 ${formatNumber(c.wood)} · 🍎 ${formatNumber(c.apples)}</span>
                    <span class="fmz-gb-cd" data-cd="${c.arrivalAt}">${formatDuration(leftSec)}</span>
                  </div>
                </div>
              `;
            })
            .join("");

      const convoyOutHtml = !playerConvoys.outgoing.length
        ? `<div class="fmz-gb-empty">Aucun convoi sortant.</div>`
        : playerConvoys.outgoing
            .map((c) => {
              const leftSec = Math.max(0, Math.ceil((c.arrivalAt - now) / 1000));
              return `
                <div class="fmz-gb-row">
                  <div class="fmz-gb-row-top">
                    <span>Vers <b>${esc(c.toName)}</b> · 🪵 ${formatNumber(c.wood)} · 🍎 ${formatNumber(c.apples)}</span>
                    <span class="fmz-gb-cd" data-cd="${c.arrivalAt}">${formatDuration(leftSec)}</span>
                  </div>
                </div>
              `;
            })
            .join("");

      const hasUrgent = attacks.some((a) => (Number(a.arrivalAt || 0) - now) <= 30 * 60 * 1000);

      return `
        <div id="fmz-gb-card">
          <div class="fmz-gb-head">
            <b>👤 ${esc(selected.name)}${selected.key === meKey ? " (moi)" : ""}</b>
            <div class="fmz-gb-head-actions">
              <button id="fmz-gb-pl-back" class="fmz-gb-btn" type="button" title="Retour à la liste">←</button>
              <button id="fmz-gb-refresh" class="fmz-gb-btn" type="button" title="Rafraîchir maintenant">🔄</button>
              <button id="fmz-gb-pl-close" class="fmz-gb-btn" type="button" title="Réduire">_</button>
            </div>
          </div>
          <div class="fmz-gb-status-bar">
            <span>${esc(syncStatus.label)}</span>
            <a class="fmz-gb-link" href="${esc(SHORTCUT_LINKS.membersUrl)}">📋 Membres (TDC)</a>
          </div>
          ${summaryHtml}
          ${renderSectionBlock(
            "pl_attacks",
            "⚔️ Attaques sur ce joueur",
            attacks.length,
            listHtml,
            `danger ${hasUrgent ? "urgent" : ""}`,
            !!collapsedMap.pl_attacks
          )}
          ${renderSectionBlock(
            "pl_hunts",
            "🏹 Chasses en cours",
            hunts.length,
            huntsListHtml,
            "hunt",
            !!collapsedMap.pl_hunts
          )}
          ${renderSectionBlock(
            "pl_convoy_in",
            "📥 Convois entrants",
            playerConvoys.incoming.length,
            convoyInHtml,
            "in",
            !!collapsedMap.pl_convoy_in
          )}
          ${renderSectionBlock(
            "pl_convoy_out",
            "📤 Convois sortants",
            playerConvoys.outgoing.length,
            convoyOutHtml,
            "out",
            !!collapsedMap.pl_convoy_out
          )}
        </div>
      `;
    }

    const rowsHtml = !players.length
      ? `<div class="fmz-gb-empty">Aucun joueur ${OWN_ALLIANCE_TAG} trouvé.</div>`
      : players
          .map((p) => {
            const tdc = p.tdc || getPlayerTdc(p.name);
            const isMe = p.key === meKey;
            return `
              <button class="fmz-gb-player ${isMe ? "me" : ""} ${p.count > 0 ? "attacked" : ""}" data-pl-select="${esc(p.key)}" type="button">
                <span><b>${esc(p.name)}</b>${isMe ? " (moi)" : ""}${tdc ? `<span class="fmz-gb-player-tdc">${formatNumber(tdc)} cm²</span>` : ""}</span>
                <span style="display:flex;gap:4px;align-items:center">
                  ${p.hunts > 0 ? `<span class="fmz-gb-badge" title="Chasses en cours">🏹 ${p.hunts}</span>` : ""}
                  <span class="fmz-gb-badge ${p.count > 0 ? "alert" : ""}" title="Attaques en cours sur ce joueur">${p.count}</span>
                </span>
              </button>
            `;
          })
          .join("");

    return `
      <div id="fmz-gb-card">
        <div class="fmz-gb-head">
          <b>👤 Joueurs ${OWN_ALLIANCE_TAG} · ${players.length}</b>
          <div class="fmz-gb-head-actions">
            <button id="fmz-gb-refresh" class="fmz-gb-btn" type="button" title="Rafraîchir maintenant">🔄</button>
            <button id="fmz-gb-pl-close" class="fmz-gb-btn" type="button" title="Réduire">_</button>
          </div>
        </div>
        <div class="fmz-gb-status-bar">
          <span>${esc(syncStatus.label)}</span>
          <span>Clique un joueur pour voir ses attaques</span>
        </div>
        ${rowsHtml}
      </div>
    `;
  }

  function renderGlobalBubble(forceRender = false) {
    injectGlobalBubbleStyles();
    if (!ensureContainersAttached()) return;

    const now = Date.now();
    const devUser = getDevUser();
    const locked = isSessionLocked();
    const incomingAttacks = getIncomingAttacksForCurrentUser();
    const allAllianceAttacks = getAllAllianceAttacks(now);
    const convoys = getConvoySummaryForUser(devUser, now);
    const allHunts = getAllActiveHunts(now);
    const finishedHunts = readJsonArray(STORAGE_KEYS.huntHistory).slice(0, 8);
    const openRequestsCount = convoyRequests.filter((r) => r.status !== "done").length;
    const isDomeOpen = isGlobalBubbleOpen();
    const isConvoyOpen = isConvoyBubbleOpen();
    const isAllianceOpen = isAllianceBubbleOpen();
    const isStatsOpen = isStatsBubbleOpen();
    const isPlayersOpen = isPlayersBubbleOpen();
    const collapsedMap = getCollapsedSections();

    const leftDock = document.getElementById("fmz-gb-left-dock");
    const root = document.getElementById("fmz-gb-root");
    if (!leftDock || !root) return;

    const updateBtnClass = `fmz-gb-fab update${updateAvailableInfo.available ? " needs-update" : ""}`;
    const updateBtnLabel = updateAvailableInfo.available
      ? `⬆️ MàJ (${esc(updateAvailableInfo.remoteVersion)})`
      : "⬆️ MàJ script";
    const updateBtnTitle = updateAvailableInfo.available
      ? `Nouvelle version ${updateAvailableInfo.remoteVersion} disponible (actuelle : ${SCRIPT_VERSION})`
      : `Script à jour (${SCRIPT_VERSION})`;

    const leftDockHtml = `
      <a id="fmz-gb-discord-fab" class="fmz-gb-fab" href="${esc(SHORTCUT_LINKS.discordUrl)}" target="_blank" rel="noopener noreferrer" title="Ouvrir Discord">
        <span>💬 Discord</span>
      </a>
      <a id="fmz-gb-site-fab" class="fmz-gb-fab" href="${esc(SHORTCUT_LINKS.siteUrl)}" target="_blank" rel="noopener noreferrer" title="Ouvrir le site applizzz">
        <span>🌐 Site</span>
      </a>
      <a id="fmz-gb-update-fab" class="${updateBtnClass}" href="${esc(SHORTCUT_LINKS.scriptUpdateUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(updateBtnTitle)}">
        <span>${updateBtnLabel}</span>
      </a>
      <button id="fmz-gb-stats-fab" class="fmz-gb-fab stats ${isStatsOpen ? "active" : ""}" type="button" title="Statistiques de l'alliance">
        <span>📊 Statistiques</span>
      </button>
    `;

    // Optimisation 2 : signature incluant les calculs/états pour éviter les re-rendus inutiles
    const sim = getTdcChains();
    const simSig = Array.from(sim.attacks.entries())
      .map(([k, v]) => `${k}:${v.willFail ? 1 : 0}:${v.taken || 0}:${v.ratioPct || 0}`)
      .join(",") + "|" + Array.from(sim.hunts.entries())
      .map(([k, v]) => `${k}:${v.before || 0}->${v.after || 0}`)
      .join(",");

    const rootSig = [
      devUser,
      locked ? 1 : 0,
      accountDrawerOpen ? 1 : 0,
      syncStatus.state,
      syncStatus.label,
      isDomeOpen ? 1 : 0,
      isConvoyOpen ? 1 : 0,
      isAllianceOpen ? 1 : 0,
      isStatsOpen ? 1 : 0,
      isPlayersOpen ? 1 : 0,
      allianceAttackFilter,
      allianceAttackSort,
      selectedPlayerKey,
      JSON.stringify(collapsedMap),
      lastCommerceMessage,
      IS_ATTACK_PAGE || IS_COMMERCE ? 1 : 0,
      allHunts.map((h) => `${h.sig}:${h.area}:${Math.floor((h.arrivalAt - now) / 15000)}`).join(";"),
      incomingAttacks.map((a) => `${a.sig}:${Math.floor((a.arrivalAt - now) / 15000)}`).join(";"),
      allAllianceAttacks.map((a) => `${a.sig}:${a.ants}:${Math.floor((a.arrivalAt - now) / 15000)}`).join(";"),
      convoys.incoming.map((c) => `${c.id}:${c.wood}:${c.apples}`).join(";"),
      convoys.outgoing.map((c) => `${c.id}:${c.wood}:${c.apples}`).join(";"),
      convoyRequests.map((r) => `${r.id}:${r.status}:${JSON.stringify(r.deliveries || [])}`).join(";"),
      finishedHunts.map((h) => `${h.sig || h.id}:${h.area}`).join(";"),
      simSig
    ].join("##");

    if (forceRender || leftDockSig !== lastLeftDockSig) {
      leftDock.innerHTML = leftDockHtml;
      lastLeftDockSig = leftDockSig;

      const statsFab = leftDock.querySelector("#fmz-gb-stats-fab");
      if (statsFab) {
        statsFab.onclick = () => {
          const next = !isStatsBubbleOpen();
          setStatsBubbleOpen(next);
          if (next) {
            setPlayersBubbleOpen(false);
            setGlobalBubbleOpen(false);
            setConvoyBubbleOpen(false);
            setAllianceBubbleOpen(false);
          }
          renderGlobalBubble(true);
        };
      }
    }

    if (!forceRender && rootSig === lastRootSig && root.innerHTML.trim() !== "") {
      return;
    }

    root.classList.toggle("has-armee-badge", IS_ATTACK_PAGE || IS_COMMERCE);

    const hasImminentAttack = incomingAttacks.some((a) => (Number(a.arrivalAt || 0) - now) <= 30 * 60 * 1000);
    const totalEvents =
      incomingAttacks.length +
      convoys.incoming.length +
      allHunts.length +
      convoys.outgoing.length;

    const domeBadge = incomingAttacks.length > 0
      ? `🛡️ ${incomingAttacks.length}`
      : `🌐 ${totalEvents}`;

    let cardHtml = "";

    if (isStatsOpen) {
      cardHtml = buildStatsBubbleHtml(devUser, now, collapsedMap);
    } else if (isPlayersOpen) {
      cardHtml = buildPlayersBubbleHtml(devUser, now, collapsedMap);
    } else if (isAllianceOpen) {
      cardHtml = buildAllianceBubbleHtml(devUser, now, collapsedMap);
    } else if (isConvoyOpen) {
      cardHtml = buildConvoyBubbleHtml(devUser, now, collapsedMap);
    } else if (isDomeOpen) {
      const huntsHtml = !allHunts.length
        ? `<div class="fmz-gb-empty">Aucune chasse en cours dans l'alliance.</div>`
        : allHunts
            .map((h) => {
              const leftSec = Math.max(0, Math.ceil((h.arrivalAt - now) / 1000));
              const tdcInfo = getHuntTdcSummary(h);
              const areaLabel = h.area ? ` · +${formatNumber(h.area)} cm²` : "";
              const tdcSub = tdcInfo.hasTdc
                ? `TDC actuel : <b>${formatNumber(tdcInfo.beforeTdc)}</b> · TDC après chasse : <b>${formatNumber(tdcInfo.afterTdc)}</b>`
                : `TDC actuel / après : <a class="fmz-gb-link" href="${esc(SHORTCUT_LINKS.membersUrl)}">Lire page Membres</a>`;
              return `
                <div class="fmz-gb-row">
                  <div class="fmz-gb-row-top">
                    <span><b>${esc(h.player || "Joueur")}</b>${areaLabel}</span>
                    <span class="fmz-gb-cd" data-cd="${h.arrivalAt}">${formatDuration(leftSec)}</span>
                  </div>
                  <div class="fmz-gb-tdc">${tdcSub}</div>
                </div>
              `;
            })
            .join("");

      const finishedHuntsHtml = !finishedHunts.length
        ? `<div class="fmz-gb-empty">Aucune chasse terminée enregistrée.</div>`
        : finishedHunts
            .map((h) => {
              const startTs = Number(h.firstSeenAt || h.detectedAt || 0);
              const endTs = Number(h.finishedAt || h.arrivalAt || 0);
              const durTxt = startTs > 0 && endTs > startTs
                ? ` · ⏱️ ${formatDuration(Math.round((endTs - startTs) / 1000))}`
                : "";
              const areaTxt = h.area ? `+${formatNumber(h.area)} cm²` : "Chasse";
              return `
                <div class="fmz-gb-row">
                  <div class="fmz-gb-row-top">
                    <span><b>${esc(h.player || devUser)}</b> · <b>${areaTxt}</b></span>
                    <span class="fmz-gb-cd">Terminée${durTxt}</span>
                  </div>
                </div>
              `;
            })
            .join("");

      const attacksHtml = !incomingAttacks.length
        ? `<div class="fmz-gb-empty">Aucune attaque en cours sur moi.</div>`
        : incomingAttacks
            .map((a) => {
              const leftSec = Math.max(0, Math.ceil((Number(a.arrivalAt || 0) - now) / 1000));
              const isCritical = leftSec <= 15 * 60;
              const isWarn = leftSec <= 30 * 60;
              const urgencyClass = isCritical ? "critical" : isWarn ? "warn" : "";
              const tdcInfo = getAttackTdcSummary(a);
              const atkTdc = getAttackerTdcSummary(a);
              const sentAnts = getAttackSentAnts(a);
              const willFail = tdcInfo.willFail;
              const tdcParts = [];
              if (tdcInfo.hasTdc) {
                tdcParts.push(
                  !willFail && tdcInfo.taken > 0
                    ? `Moi <b>${formatNumber(tdcInfo.beforeTdc)}→${formatNumber(tdcInfo.afterTdc)}</b>`
                    : `Moi <b>${formatNumber(tdcInfo.beforeTdc)}</b>`
                );
              }
              if (atkTdc.hasTdc) {
                tdcParts.push(
                  !willFail && atkTdc.taken > 0
                    ? `${esc(a.attacker || "Attaquant")} <b>${formatNumber(atkTdc.beforeTdc)}→${formatNumber(atkTdc.afterTdc)}</b>`
                    : `${esc(a.attacker || "Attaquant")} <b>${formatNumber(atkTdc.beforeTdc)}</b>`
                );
              }
              const antsPart = sentAnts > 0
                ? ` · 🐜 ${formatNumber(sentAnts)}`
                : ` · 🐜 effectif inconnu`;
              const tdcSub = tdcParts.length
                ? `${tdcParts.join(" · ")} cm²${antsPart}`
                : `TDC : <a class="fmz-gb-link" href="${esc(SHORTCUT_LINKS.membersUrl)}">Lire page Membres</a>${antsPart}`;
              const ruleLine = willFail
                ? `<div class="fmz-gb-fail">⚠️ Hors plage 50%–300% (0 cm² pris) : ${esc(tdcInfo.failReason)}</div>`
                : (tdcInfo.hasTdc ? `<div class="fmz-gb-rule">🎯 Prise max : <b>${formatNumber(tdcInfo.taken)} cm²</b> (20% cible / effectif)</div>` : "");
              return `
                <div class="fmz-gb-row ${isWarn ? "soon" : ""} targeted-me ${willFail ? "will-fail" : ""}">
                  <div class="fmz-gb-row-top">
                    <b>${willFail ? "⚠️" : isCritical ? "🚨" : "🐎"} ${esc(a.attacker || "Inconnu")}</b>
                    <span class="fmz-gb-cd ${urgencyClass}" data-cd="${a.arrivalAt}">${formatDuration(leftSec)}</span>
                  </div>
                  <div class="fmz-gb-tdc">${tdcSub}</div>
                  ${ruleLine}
                </div>
              `;
            })
            .join("");

      const incomingConvoysHtml = !convoys.incoming.length
        ? `<div class="fmz-gb-empty">Aucun convoi en route vers moi.</div>`
        : convoys.incoming
            .map((c) => {
              const leftSec = Math.max(0, Math.ceil((c.arrivalAt - now) / 1000));
              return `
                <div class="fmz-gb-row">
                  <div class="fmz-gb-row-top">
                    <span>De <b>${esc(c.fromName)}</b> · 🪵 ${formatNumber(c.wood)} · 🍎 ${formatNumber(c.apples)}</span>
                    <span class="fmz-gb-cd" data-cd="${c.arrivalAt}">${formatDuration(leftSec)}</span>
                  </div>
                </div>
              `;
            })
            .join("");

      const outgoingConvoysHtml = !convoys.outgoing.length
        ? `<div class="fmz-gb-empty">Aucun convoi lancé en cours.</div>`
        : convoys.outgoing
            .map((c) => {
              const leftSec = Math.max(0, Math.ceil((c.arrivalAt - now) / 1000));
              return `
                <div class="fmz-gb-row">
                  <div class="fmz-gb-row-top">
                    <span>Vers <b>${esc(c.toName)}</b> · 🪵 ${formatNumber(c.wood)} · 🍎 ${formatNumber(c.apples)}</span>
                    <span class="fmz-gb-cd" data-cd="${c.arrivalAt}">${formatDuration(leftSec)}</span>
                  </div>
                </div>
              `;
            })
            .join("");

      const accountHtml = !locked && accountDrawerOpen
        ? `
          <div class="fmz-gb-account-box">
            <div class="fmz-gb-sub">Pseudo / Session Worker :</div>
            <div class="fmz-gb-account-row">
              <input id="fmz-gb-pseudo-input" class="fmz-gb-account-input" type="text" value="${esc(devUser)}" autocomplete="off">
              <button id="fmz-gb-pseudo-save" class="fmz-gb-btn" type="button">OK</button>
              <button id="fmz-gb-logout-btn" class="fmz-gb-btn" type="button" title="Réinitialiser mot de passe et token">Reset</button>
            </div>
          </div>
        `
        : "";

      const accBtnHtml = !locked
        ? `<button id="fmz-gb-acc" class="fmz-gb-btn" type="button" title="Compte & session">⚙️</button>`
        : "";

      const membersLink = `<a class="fmz-gb-link" href="${esc(SHORTCUT_LINKS.membersUrl)}">📋 Membres (TDC)</a>`;

      cardHtml = `
        <div id="fmz-gb-card">
          <div class="fmz-gb-head">
            <b>🐜 Dôme · ${esc(devUser)}</b>
            <div class="fmz-gb-head-actions">
              <button id="fmz-gb-refresh" class="fmz-gb-btn" type="button" title="Rafraîchir maintenant">🔄</button>
              ${accBtnHtml}
              <button id="fmz-gb-close" class="fmz-gb-btn" type="button" title="Réduire">_</button>
            </div>
          </div>

          <div class="fmz-gb-status-bar">
            <span>${esc(syncStatus.label)}</span>
            ${membersLink}
          </div>

          ${accountHtml}

          ${renderSectionBlock(
            "hunts",
            "⚔️ Chasses en cours (tous)",
            allHunts.length,
            huntsHtml,
            "hunt",
            !!collapsedMap.hunts
          )}

          ${renderSectionBlock(
            "attacks",
            "🛡️ Attaques en cours sur moi",
            incomingAttacks.length,
            attacksHtml,
            `danger ${hasImminentAttack ? "urgent" : ""}`,
            !!collapsedMap.attacks
          )}

          ${renderSectionBlock(
            "convoy_in",
            "📥 Convois qui arrivent sur moi",
            convoys.incoming.length,
            incomingConvoysHtml,
            "in",
            !!collapsedMap.convoy_in
          )}

          ${renderSectionBlock(
            "convoy_out",
            "📤 Convois que j'ai lancés",
            convoys.outgoing.length,
            outgoingConvoysHtml,
            "out",
            !!collapsedMap.convoy_out
          )}

          ${renderSectionBlock(
            "hunt_hist",
            "📜 Chasses terminées",
            finishedHunts.length,
            finishedHuntsHtml,
            "",
            collapsedMap.hunt_hist !== undefined ? !!collapsedMap.hunt_hist : true
          )}
        </div>
      `;
    }

    root.innerHTML = `
      ${cardHtml}
      <div class="fmz-gb-dock">
        <button id="fmz-gb-players-fab" class="fmz-gb-fab players ${isPlayersOpen ? "active" : ""}" type="button" title="Attaques par joueur">
          <span>👤</span>
        </button>
        <button id="fmz-gb-alliance-fab" class="fmz-gb-fab alliance ${isAllianceOpen ? "active" : ""} ${allAllianceAttacks.length > 0 ? "alert" : ""}" type="button" title="Toutes les attaques de l'alliance">
          <span>🛡️ Alliance</span>
          <span class="fmz-gb-pill">${allAllianceAttacks.length}</span>
        </button>
        <button id="fmz-gb-convoy-fab" class="fmz-gb-fab convoy ${isConvoyOpen ? "active" : ""}" type="button" title="Demandes et convois">
          <span>🚚 Convois</span>
          <span class="fmz-gb-pill">${openRequestsCount}</span>
        </button>
        <button id="fmz-gb-fab" class="fmz-gb-fab ${incomingAttacks.length > 0 ? "alert" : ""}" type="button" title="Résumé Dôme de la Paix">
          <span>Dôme</span>
          <span class="fmz-gb-pill">${domeBadge}</span>
        </button>
      </div>
    `;
    lastRootSig = rootSig;

    root.querySelector("#fmz-gb-players-fab").onclick = () => {
      const next = !isPlayersBubbleOpen();
      setPlayersBubbleOpen(next);
      if (next) {
        setGlobalBubbleOpen(false);
        setConvoyBubbleOpen(false);
        setAllianceBubbleOpen(false);
        setStatsBubbleOpen(false);
      }
      renderGlobalBubble(true);
    };

    root.querySelectorAll("[data-pl-select]").forEach((btn) => {
      btn.onclick = () => {
        selectedPlayerKey = btn.getAttribute("data-pl-select") || "";
        renderGlobalBubble(true);
      };
    });

    const plBackBtn = root.querySelector("#fmz-gb-pl-back");
    if (plBackBtn) {
      plBackBtn.onclick = () => {
        selectedPlayerKey = "";
        renderGlobalBubble(true);
      };
    }

    const closePlayersBtn = root.querySelector("#fmz-gb-pl-close");
    if (closePlayersBtn) {
      closePlayersBtn.onclick = () => {
        setPlayersBubbleOpen(false);
        renderGlobalBubble(true);
      };
    }

    root.querySelector("#fmz-gb-alliance-fab").onclick = () => {
      const next = !isAllianceBubbleOpen();
      setAllianceBubbleOpen(next);
      if (next) {
        setPlayersBubbleOpen(false);
        setGlobalBubbleOpen(false);
        setConvoyBubbleOpen(false);
        setStatsBubbleOpen(false);
      }
      renderGlobalBubble(true);
    };

    root.querySelector("#fmz-gb-fab").onclick = () => {
      const next = !isGlobalBubbleOpen();
      setGlobalBubbleOpen(next);
      if (next) {
        setPlayersBubbleOpen(false);
        setConvoyBubbleOpen(false);
        setAllianceBubbleOpen(false);
        setStatsBubbleOpen(false);
      }
      renderGlobalBubble(true);
    };

    root.querySelector("#fmz-gb-convoy-fab").onclick = () => {
      const next = !isConvoyBubbleOpen();
      setConvoyBubbleOpen(next);
      if (next) {
        setPlayersBubbleOpen(false);
        setGlobalBubbleOpen(false);
        setAllianceBubbleOpen(false);
        setStatsBubbleOpen(false);
      }
      renderGlobalBubble(true);
    };

    root.querySelectorAll("[data-al-filter]").forEach((btn) => {
      btn.onclick = () => {
        allianceAttackFilter = btn.getAttribute("data-al-filter") || "all";
        renderGlobalBubble(true);
      };
    });

    root.querySelectorAll("[data-al-sort]").forEach((btn) => {
      btn.onclick = () => {
        allianceAttackSort = btn.getAttribute("data-al-sort") || "time";
        renderGlobalBubble(true);
      };
    });

    const closeStatsBtn = root.querySelector("#fmz-gb-st-close");
    if (closeStatsBtn) {
      closeStatsBtn.onclick = () => {
        setStatsBubbleOpen(false);
        renderGlobalBubble(true);
      };
    }

    const closeAllianceBtn = root.querySelector("#fmz-gb-al-close");
    if (closeAllianceBtn) {
      closeAllianceBtn.onclick = () => {
        setAllianceBubbleOpen(false);
        renderGlobalBubble(true);
      };
    }

    const closeDomeBtn = root.querySelector("#fmz-gb-close");
    if (closeDomeBtn) {
      closeDomeBtn.onclick = () => {
        setGlobalBubbleOpen(false);
        renderGlobalBubble(true);
      };
    }

    const closeConvoyBtn = root.querySelector("#fmz-gb-cv-close");
    if (closeConvoyBtn) {
      closeConvoyBtn.onclick = () => {
        setConvoyBubbleOpen(false);
        renderGlobalBubble(true);
      };
    }

    const refreshBtn = root.querySelector("#fmz-gb-refresh");
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        setSyncState("syncing", "Synchro…");
        renderGlobalBubble(true);
        checkScriptUpdate(true);
        await pullFromWorker(true);
        runPageCycle();
      };
    }

    const accBtn = root.querySelector("#fmz-gb-acc");
    if (accBtn) {
      accBtn.onclick = () => {
        if (isSessionLocked()) return;
        accountDrawerOpen = !accountDrawerOpen;
        renderGlobalBubble(true);
      };
    }

    const savePseudoBtn = root.querySelector("#fmz-gb-pseudo-save");
    const pseudoInp = root.querySelector("#fmz-gb-pseudo-input");
    const logoutBtn = root.querySelector("#fmz-gb-logout-btn");

    if (savePseudoBtn && pseudoInp) {
      const submitPseudo = () => {
        if (isSessionLocked()) return;
        setDevUser(pseudoInp.value);
        accountDrawerOpen = false;
        runPageCycle();
        pullFromWorker(true).then((changed) => {
          if (changed) runPageCycle();
          else renderGlobalBubble(true);
        });
      };
      savePseudoBtn.onclick = submitPseudo;
      pseudoInp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submitPseudo();
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.onclick = () => {
        if (isSessionLocked()) return;
        resetAccountSession(pseudoInp ? pseudoInp.value : "");
        accountDrawerOpen = false;
        runPageCycle();
      };
    }

    root.querySelectorAll("[data-toggle-sec]").forEach((hdr) => {
      hdr.onclick = () => {
        const key = hdr.getAttribute("data-toggle-sec");
        if (key) {
          toggleSectionCollapsed(key);
          renderGlobalBubble(true);
        }
      };
    });

    if (isConvoyOpen) {
      bindConvoyBubbleEvents(root);
    }
  }

  function tickCountdowns() {
    const tNow = Date.now();
    let expired = false;
    document.querySelectorAll("[data-cd]").forEach((el) => {
      const arr = Number(el.getAttribute("data-cd") || 0);
      const left = Math.ceil((arr - tNow) / 1000);
      if (left <= 0) expired = true;
      else el.textContent = formatDuration(left);
    });
    if (expired) runPageCycle();
  }

  function observeBodyMutations() {
    if (!document.body || document.body.dataset.fmzBodyObserver === "1") return;
    document.body.dataset.fmzBodyObserver = "1";
    const obs = new MutationObserver(() => {
      if (
        !document.getElementById("fmz-gb-left-dock") ||
        !document.getElementById("fmz-gb-root") ||
        ((IS_ATTACK_PAGE || IS_COMMERCE) && !document.getElementById("fmz-armee-badge-wrap"))
      ) {
        lastLeftDockSig = "";
        lastRootSig = "";
        runPageCycle();
      }
    });
    obs.observe(document.body, { childList: true, subtree: false });
  }

  function runPageCycle() {
    if (!ensureContainersAttached()) return;
    observeBodyMutations();
    removeLegacyRessourcesPanel();
    if (isMembersPageView()) {
      scrapeAllianceMembersTdc();
    }
    if (IS_HUNT_PAGE) {
      reconcileHunts();
      if (IS_ACQUERIR_TERRAIN) {
        updateAcquerirTerrainPreview();
        setupAcquerirTerrainGuard();
      }
    } else if (IS_ATTACK_PAGE) {
      ensureArmeeIndicator();
      reconcileArmeeAttacks();
    } else if (IS_COMMERCE) {
      ensureArmeeIndicator();
      consumePendingCommerceFillIfNeeded();
      reconcileCommerceConvoys();
    }
    renderGlobalBubble();
  }

  cleanAllianceTdcMap();
  runPageCycle();
  consumePendingCommerceFillIfNeeded();
  checkScriptUpdate(false);
  pullFromWorker(true).then((changed) => {
    if (changed) runPageCycle();
    else renderGlobalBubble();
  });

  setInterval(tickCountdowns, 1000);

  setInterval(() => {
    const active = document.activeElement;
    if (
      active &&
      (active.id === "fmz-gb-pseudo-input" ||
        (active.closest && active.closest("#fmz-gb-root")))
    ) {
      return;
    }
    runPageCycle();
  }, 5000);

  // Optimisation 1 : éviter les appels réseau si l'onglet est caché et synchroniser au retour
  setInterval(() => {
    if (document.hidden) return;
    const active = document.activeElement;
    if (active && active.closest && active.closest("#fmz-gb-root")) return;
    checkScriptUpdate(false);
    pullFromWorker(false).then((changed) => {
      if (changed) runPageCycle();
      else renderGlobalBubble();
    });
  }, 15000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      runPageCycle();
      pullFromWorker(false).then((changed) => {
        if (changed) runPageCycle();
        else renderGlobalBubble();
      });
    }
  });

  document.addEventListener("submit", () => {
    setTimeout(() => runPageCycle(), 150);
    setTimeout(() => runPageCycle(), 600);
  }, true);

  window.addEventListener("pageshow", () => {
    lastLeftDockSig = "";
    lastRootSig = "";
    runPageCycle();
  });

  window.addEventListener("storage", (e) => {
    if (
      e.key === STORAGE_KEYS.attacks ||
      e.key === STORAGE_KEYS.hunts ||
      e.key === STORAGE_KEYS.movements ||
      e.key === STORAGE_KEYS.devUser ||
      e.key === STORAGE_KEYS.convoyRequests ||
      e.key === STORAGE_KEYS.bubbleOpen ||
      e.key === STORAGE_KEYS.convoyBubbleOpen ||
      e.key === STORAGE_KEYS.allianceBubbleOpen ||
      e.key === STORAGE_KEYS.statsBubbleOpen ||
      e.key === STORAGE_KEYS.playersBubbleOpen ||
      e.key === STORAGE_KEYS.bubbleSections ||
      e.key === STORAGE_KEYS.allianceTdc ||
      e.key === STORAGE_KEYS.allianceStats
    ) {
      runPageCycle();
    }
  });
})();
