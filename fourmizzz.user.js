// ==UserScript==
// @name         Le Dôme De La Paix - Fourmizzz S5 (Ressources, Armee, Commerce & Alliance)
// @namespace    https://s5.fourmizzz.fr/
// @version      0.5.63-worker
// @updateURL    https://raw.githubusercontent.com/LDDLP/applizze-script/main/fourmizzz.user.js
// @downloadURL  https://raw.githubusercontent.com/LDDLP/applizze-script/main/fourmizzz.user.js
// @description  Outils d'alliance centralisés sur S5 : chasses en tête du Dôme avec TDC + chassé, attaques compactes avec filtres et tri, TDC attaquant/cible en rouge/vert, règle 50%-300% / 20% max, convois, fiche joueur dédiée et import auto construction/laboratoire.
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

  if (typeof window === "undefined" || !window.location) return;

  const HOST = window.location.hostname.toLowerCase();
  if (HOST !== "s5.fourmizzz.fr") return;

  const SCRIPT_VERSION = "0.5.63-worker";

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
  const IS_CONSTRUCTION = PATH.includes("construction.php");
  const IS_LABORATOIRE = PATH.includes("laboratoire.php");

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
    playerProfiles: "fmz_player_profiles_v1",
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
  let selectedPlayerTab = "overview";
  let updateAvailableInfo = { available: false, remoteVersion: "" };

  let lastLeftDockSig = "";
  let lastRootSig = "";
  let lastMembersTableSig = "";
  let lastConstructionSig = "";
  let lastLaboSig = "";

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

  function getKnownAllianceKeys() {
    const keys = new Set(LDDLP_KEYS);
    try {
      const tdcRaw = JSON.parse(localStorage.getItem(STORAGE_KEYS.allianceTdc) || "{}");
      if (tdcRaw && typeof tdcRaw === "object") {
        for (const [k, v] of Object.entries(tdcRaw)) {
          if (!k || k.startsWith("_")) continue;
          const n = normalizePseudo((v && v.pseudo) || k);
          if (n) keys.add(n);
        }
      }
    } catch (e) {}
    try {
      const stRaw = JSON.parse(localStorage.getItem(STORAGE_KEYS.allianceStats) || "null");
      const top = stRaw && (stRaw.topPlayers || stRaw.ranking || stRaw.items);
      if (Array.isArray(top)) {
        for (const item of top) {
          const n = normalizePseudo(item && (item.name || item.pseudo || item.player));
          if (n) keys.add(n);
        }
      }
    } catch (e) {}
    return keys;
  }

  function registerAllianceMemberPseudo(rawName) {
    const clean = playerDisplayName(rawName);
    if (!isCleanPlayerName(clean)) return false;
    const norm = normalizePseudo(clean);
    if (!norm) return false;
    LDDLP_KEYS.add(norm);
    return true;
  }

  const TAB_ID = Math.random().toString(36).slice(2);
  const LEADER_KEY = "fmz_sync_leader_v1";
  const LEADER_TTL_MS = 40 * 1000;

  function claimSyncLeader(forceTakeover = false) {
    try {
      const now = Date.now();
      const cur = JSON.parse(localStorage.getItem(LEADER_KEY) || "null");
      if (!forceTakeover && cur && cur.id !== TAB_ID && now - Number(cur.at) < LEADER_TTL_MS) {
        return false;
      }
      localStorage.setItem(LEADER_KEY, JSON.stringify({ id: TAB_ID, at: now }));
      const check = JSON.parse(localStorage.getItem(LEADER_KEY) || "null");
      return !!check && check.id === TAB_ID;
    } catch (e) {
      return true;
    }
  }

  function releaseSyncLeader() {
    try {
      const cur = JSON.parse(localStorage.getItem(LEADER_KEY) || "null");
      if (cur && cur.id === TAB_ID) localStorage.removeItem(LEADER_KEY);
    } catch (e) {}
  }

  window.addEventListener("pagehide", releaseSyncLeader);

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

  function readPlayerProfilesMap() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.playerProfiles);
      const parsed = JSON.parse(raw || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writePlayerProfilesMap(mapObj) {
    try {
      localStorage.setItem(STORAGE_KEYS.playerProfiles, JSON.stringify(mapObj));
    } catch (e) {}
  }

  function getPlayerProfile(pseudo) {
    const norm = normalizePseudo(pseudo);
    if (!norm) {
      return {
        pseudo: "",
        attackSpeed: null,
        buildings: {},
        lab: {},
        updatedAt: 0
      };
    }
    const map = readPlayerProfilesMap();
    const cur = map[norm] || {};
    return {
      pseudo: cur.pseudo || playerDisplayName(pseudo),
      attackSpeed: cur.attackSpeed != null && Number.isFinite(Number(cur.attackSpeed)) ? Number(cur.attackSpeed) : null,
      buildings: cur.buildings && typeof cur.buildings === "object" ? cur.buildings : {},
      lab: cur.lab && typeof cur.lab === "object" ? cur.lab : {},
      updatedAt: Number(cur.updatedAt || 0)
    };
  }

  function updatePlayerProfile(pseudo, patch, syncRemote = false) {
    const cleanName = playerDisplayName(pseudo || getDevUser());
    const norm = normalizePseudo(cleanName);
    if (!norm) return null;

    const map = readPlayerProfilesMap();
    const prev = map[norm] || {
      pseudo: cleanName,
      attackSpeed: null,
      buildings: {},
      lab: {},
      updatedAt: 0
    };

    const next = {
      ...prev,
      pseudo: cleanName,
      attackSpeed:
        patch && patch.attackSpeed !== undefined
          ? (patch.attackSpeed != null && Number.isFinite(Number(patch.attackSpeed)) ? Number(patch.attackSpeed) : null)
          : prev.attackSpeed,
      buildings: {
        ...(prev.buildings || {}),
        ...((patch && patch.buildings) || {})
      },
      lab: {
        ...(prev.lab || {}),
        ...((patch && patch.lab) || {})
      },
      updatedAt: Date.now()
    };

    map[norm] = next;
    writePlayerProfilesMap(map);

    if (syncRemote && getKnownAllianceKeys().has(norm)) {
      syncWithWorker(
        {
          kind: "players",
          alliance: OWN_ALLIANCE_TAG,
          players: [
            {
              name: next.pseudo,
              pseudo: next.pseudo,
              attackSpeed: next.attackSpeed,
              buildings: next.buildings,
              lab: next.lab,
              updatedAt: next.updatedAt
            }
          ]
        },
        `profile_${norm}`
      );
    }

    return next;
  }

  function ingestRemotePlayerProfiles(remotePlayers) {
    if (!Array.isArray(remotePlayers) || !remotePlayers.length) return;
    let changed = false;
    for (const p of remotePlayers) {
      if (!p || typeof p !== "object") continue;
      const name = String(p.name || p.pseudo || p.player || "").trim();
      if (!isCleanPlayerName(name)) continue;
      registerAllianceMemberPseudo(name);
      if (!isKnownAllianceMemberName(name)) continue;
      const norm = normalizePseudo(name);
      const map = readPlayerProfilesMap();
      const prev = map[norm] || {};
      const remoteUpdated = Number(p.updatedAt || 0);
      const localUpdated = Number(prev.updatedAt || 0);

      if (remoteUpdated && localUpdated && remoteUpdated < localUpdated) continue;

      const patch = {};
      const rawVa = p.attackSpeed ?? p.va ?? (p.lab && p.lab["Vitesse d'attaque"] && p.lab["Vitesse d'attaque"].level);
      if (rawVa !== undefined && rawVa !== null && rawVa !== "") {
        const vaNum = Number(rawVa);
        if (Number.isFinite(vaNum) && vaNum >= 0) patch.attackSpeed = vaNum;
      }
      if (p.buildings && typeof p.buildings === "object") {
        patch.buildings = p.buildings;
      }
      if (p.lab && typeof p.lab === "object") {
        patch.lab = p.lab;
      }

      if (Object.keys(patch).length > 0) {
        updatePlayerProfile(name, patch, false);
        changed = true;
      }
    }
    if (changed) {
      renderGlobalBubble(true);
    }
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
    const knownKeys = getKnownAllianceKeys();
    const list = Object.entries(mapObj || {})
      .filter(
        ([k, v]) =>
          k &&
          !k.startsWith("_") &&
          knownKeys.has(normalizePseudo((v && v.pseudo) || k)) &&
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
    if (Array.isArray(rawStats.topPlayers)) {
      rawStats.topPlayers.forEach((p) => {
        if (p) registerAllianceMemberPseudo(p.name || p.pseudo || p.player);
      });
    }
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
    return getKnownAllianceKeys().has(norm);
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
      if (!isCleanPlayerName(name)) continue;
      registerAllianceMemberPseudo(name);
      if (!isKnownAllianceMemberName(name)) continue;
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

    ingestRemotePlayerProfiles(remotePlayers);
  }

  function getPlayerTdc(pseudo) {
    const norm = normalizePseudo(pseudo);
    if (!norm || !getKnownAllianceKeys().has(norm)) return null;
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

  function getPlayerAttackSpeed(pseudo) {
    const norm = normalizePseudo(pseudo);
    if (!norm) return null;
    const prof = getPlayerProfile(pseudo);
    if (prof.attackSpeed != null && Number.isFinite(Number(prof.attackSpeed))) {
      return Number(prof.attackSpeed);
    }
    const labVa = prof.lab && (prof.lab["Vitesse d'attaque"] || prof.lab["Vitesse d’attaque"]);
    if (labVa && labVa.level != null && Number.isFinite(Number(labVa.level))) {
      return Number(labVa.level);
    }
    const fb = DEFAULT_PLAYERS.find((p) => normalizePseudo(p.name) === norm);
    return fb && typeof fb.va === "number" && fb.va > 0 ? fb.va : null;
  }

  function evaluateTargetAttackability(targetPseudo, attackerPseudo = getDevUser(), nowMs = Date.now()) {
    const targetNorm = normalizePseudo(targetPseudo);
    const attackerNorm = normalizePseudo(attackerPseudo);
    const sim = simulateTimeline(nowMs);

    const baseTargetTdc = getPlayerTdc(targetPseudo);
    const baseAttackerTdc = getPlayerTdc(attackerPseudo);

    const projTargetTdc =
      sim.finalTdc && sim.finalTdc.has(targetNorm) && sim.finalTdc.get(targetNorm) != null
        ? sim.finalTdc.get(targetNorm)
        : baseTargetTdc;
    const projAttackerTdc =
      sim.finalTdc && sim.finalTdc.has(attackerNorm) && sim.finalTdc.get(attackerNorm) != null
        ? sim.finalTdc.get(attackerNorm)
        : baseAttackerTdc;

    const targetVa = getPlayerAttackSpeed(targetPseudo);
    const attackerVa = getPlayerAttackSpeed(attackerPseudo);

    if (!projTargetTdc || projTargetTdc <= 0 || !projAttackerTdc || projAttackerTdc <= 0) {
      return {
        attackable: null,
        ratioPct: null,
        baseTargetTdc,
        projTargetTdc,
        baseAttackerTdc,
        projAttackerTdc,
        targetVa,
        attackerVa,
        reason: "TDC manquant pour évaluer 50%–300%"
      };
    }

    const ratioPct = Math.round((projTargetTdc / projAttackerTdc) * 100);
    const inRange = projTargetTdc >= projAttackerTdc * 0.5 && projTargetTdc <= projAttackerTdc * 3;
    const futureMovesCount = Array.from(sim.attacks.values()).filter(
      (ev) =>
        normalizePseudo(ev.item && ev.item.target) === targetNorm ||
        normalizePseudo(ev.item && ev.item.attacker) === targetNorm ||
        normalizePseudo(ev.item && ev.item.target) === attackerNorm
    ).length;

    let reason = inRange
      ? `Dans la plage 50%–300% (${ratioPct}%)${futureMovesCount ? ` après ${futureMovesCount} mouvement(s)` : ""}`
      : ratioPct < 50
        ? `Cible trop petite (${ratioPct}% < 50%) après mouvements`
        : `Cible trop grande (${ratioPct}% > 300%) après mouvements`;

    if (attackerVa != null) {
      reason += ` · VA attaquant : ${attackerVa}`;
    }

    return {
      attackable: inRange,
      ratioPct,
      baseTargetTdc,
      projTargetTdc,
      baseAttackerTdc,
      projAttackerTdc,
      targetVa,
      attackerVa,
      reason
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

  function convoyPartiesKey(m) {
    const fromN = normalizePseudo((m.from && m.from.name) || m.createdBy || "");
    const toN = normalizePseudo((m.to && m.to.name) || "");
    return `${fromN}|${toN}|${Number(m.wood || 0)}|${Number(m.apples || 0)}`;
  }

  function isSameConvoy(a, b) {
    return (
      convoyPartiesKey(a) === convoyPartiesKey(b) &&
      Math.abs(Number(a.arrivalAt || 0) - Number(b.arrivalAt || 0)) <= 180000
    );
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
    const merged = [];

    for (const m of localList) {
      if (!m || Number(m.arrivalAt) <= now) continue;
      if (!merged.some((x) => isSameConvoy(x, m))) merged.push(m);
    }

    for (const m of remoteConvoys) {
      if (!m || m.id === undefined || Number(m.arrivalAt) <= now) continue;
      if (!merged.some((x) => isSameConvoy(x, m))) merged.push(m);
    }

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
    if (force) {
      nextRetryAt = 0;
    }
    if (!claimSyncLeader(force)) return false;
    if (!force && Date.now() < nextRetryAt) {
      setSyncState("backoff", "Pause synchro");
      return false;
    }

    setSyncState("syncing", "Synchro…");
    let token = await ensureWorkerToken(baseUrl, false);
    if (!token) {
      nextRetryAt = Date.now() + RETRY_DELAY_MS;
      setSyncState("error", "Auth requise");
      return false;
    }

    const syncQs = ["scope=active"];
    if (!force && lastSyncUpdatedAt) syncQs.push(`since=${lastSyncUpdatedAt}`);
    const syncUrl = `${baseUrl}/api/sync?${syncQs.join("&")}`;
    let res = await httpJsonRequest("GET", syncUrl, undefined, token);

    if (!res.ok && res.status === 401) {
      setStoredToken("");
      token = await ensureWorkerToken(baseUrl, true);
      if (token) {
        res = await httpJsonRequest("GET", syncUrl, undefined, token);
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

    if (data.unchanged) return false;

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
      const remoteReqs = data.requests.map((r) => ({
        ...r,
        deliveries: Array.isArray(r.deliveries) ? r.deliveries : []
      }));
      const remoteIds = new Set(remoteReqs.map((r) => String(r.id)));
      const pendingReqs = convoyRequests.filter(
        (r) => r && r._pending && !remoteIds.has(String(r.id)) && r.status !== "done" &&
          Date.now() - Number(r.createdAt || 0) < 10 * 60 * 1000
      );
      pendingReqs.forEach((r) => syncWithWorker({ kind: "requests", action: "create", request: r }, false));
      convoyRequests = remoteReqs.concat(pendingReqs);
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

  function scrapeAllianceMembersTdc(forceScan = false) {
    if (!document.body || !isMembersPageView()) return 0;

    const tables = Array.from(document.querySelectorAll("table")).filter(
      (tbl) => !(tbl.closest && (tbl.closest("#fmz-gb-root") || tbl.closest("#fmz-gb-left-dock")))
    );
    const currentSig = tables.map((t) => (t.innerText || "").trim()).join("||");
    if (!forceScan && currentSig && currentSig === lastMembersTableSig) {
      return 0;
    }
    lastMembersTableSig = currentSig;

    const map = cleanAllianceTdcMap();
    const now = Date.now();
    let count = 0;

    for (const tbl of tables) {
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

        if (!isCleanPlayerName(rawPseudo)) continue;
        registerAllianceMemberPseudo(rawPseudo);

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
      const profilesMap = readPlayerProfilesMap();
      const knownKeys = getKnownAllianceKeys();
      const playersList = Object.entries(map)
        .filter(([k, v]) => k && !k.startsWith("_") && knownKeys.has(k) && v && v.tdc > 0)
        .map(([k, v]) => {
          const prof = profilesMap[k] || {};
          return {
            name: playerDisplayName(v.pseudo),
            pseudo: playerDisplayName(v.pseudo),
            tdc: Math.floor(v.tdc),
            alliance: OWN_ALLIANCE_TAG,
            attackSpeed: prof.attackSpeed ?? null,
            buildings: prof.buildings || {},
            lab: prof.lab || {},
            updatedAt: prof.updatedAt || now
          };
        });
      syncWithWorker({ kind: "players", alliance: OWN_ALLIANCE_TAG, players: playersList }, "lddlp_players");
      if (statsPayload) {
        syncWithWorker({ kind: "stats", alliance: OWN_ALLIANCE_TAG, stats: statsPayload }, "lddlp_stats");
      }
    }
    return count;
  }

  function parseLevelEntryFromLine(lineText) {
    const clean = String(lineText || "").replace(/\s+/g, " ").trim();
    if (!clean) return null;
    const m = clean.match(/^(.+?)\s+niveau\s+(\d+)(?:\s*->\s*(\d+))?/i);
    if (!m) return null;
    const rawName = m[1].replace(/\s+/g, " ").trim();
    const level = parseInt(m[2], 10);
    const targetLevel = m[3] ? parseInt(m[3], 10) : null;
    if (!rawName || !Number.isFinite(level)) return null;
    return {
      name: rawName,
      level,
      targetLevel: targetLevel && Number.isFinite(targetLevel) ? targetLevel : null
    };
  }

  function scrapeConstructionPage(forceScan = false) {
    if (!IS_CONSTRUCTION || !document.body) return 0;
    const text = document.body.innerText || "";
    const sig = text.replace(/\s+/g, " ").trim();
    if (!forceScan && sig && sig === lastConstructionSig) return 0;
    lastConstructionSig = sig;

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const buildings = {};

    for (let i = 0; i < lines.length; i++) {
      let entry = parseLevelEntryFromLine(lines[i]);
      if (!entry && i + 1 < lines.length) {
        entry = parseLevelEntryFromLine(`${lines[i]} ${lines[i + 1]}`);
      }
      if (!entry) continue;
      if (/\b(?:technique de ponte|bouclier|armes|architecture|communication|vitesse de chasse|vitesse d'attaque|génétique|acide|poison)\b/i.test(entry.name)) {
        continue;
      }
      buildings[entry.name] = {
        level: entry.level,
        targetLevel: entry.targetLevel,
        updatedAt: Date.now()
      };
    }

    const count = Object.keys(buildings).length;
    if (count > 0) {
      updatePlayerProfile(getDevUser(), { buildings }, true);
    }
    return count;
  }

  function scrapeLaboratoirePage(forceScan = false) {
    if (!IS_LABORATOIRE || !document.body) return 0;
    const text = document.body.innerText || "";
    const sig = text.replace(/\s+/g, " ").trim();
    if (!forceScan && sig && sig === lastLaboSig) return 0;
    lastLaboSig = sig;

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const lab = {};
    let detectedVa = null;

    for (let i = 0; i < lines.length; i++) {
      let entry = parseLevelEntryFromLine(lines[i]);
      if (!entry && i + 1 < lines.length) {
        entry = parseLevelEntryFromLine(`${lines[i]} ${lines[i + 1]}`);
      }
      if (!entry) continue;
      lab[entry.name] = {
        level: entry.level,
        targetLevel: entry.targetLevel,
        updatedAt: Date.now()
      };
      if (/vitesse\s+d['’]attaque/i.test(entry.name)) {
        detectedVa = entry.level;
      }
    }

    const count = Object.keys(lab).length;
    if (count > 0 || detectedVa != null) {
      const patch = { lab };
      if (detectedVa != null) {
        patch.attackSpeed = detectedVa;
      }
      updatePlayerProfile(getDevUser(), patch, true);
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
        "margin-top:8px;padding:8px 10px;background:rgba(11,18,32,.9);color:#f0f9ff;border:1px solid rgba(56,189,248,.35);border-radius:10px;font-size:12px;line-height:1.45;font-variant-numeric:tabular-nums;";
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
      `• TDC : ${baseTdc ? `<b>${formatNumber(baseTdc)} → <span style="color:#6ee7b7">${formatNumber(afterTdc)}</span> cm²</b>` : `<i>TDC actuel inconnu (ouvre Membres)</i>`}<br>` +
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
          font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;pointer-events:none;
        }
        #fmz-armee-bubble{
          background:rgba(6,78,59,.92);border:1px solid rgba(52,211,153,.65);color:#ecfdf5;
          padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;
          box-shadow:0 8px 22px rgba(0,0,0,.55),0 0 14px rgba(16,185,129,.25);
          backdrop-filter:blur(10px);
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
        } else if (/^-?\s*vous\s+(?:allez|chassez|convoquez)/i.test(line)) {
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
      (t, d) => ({
        wood: t.wood + Math.max(0, Number(d && d.wood) || 0),
        apples: t.apples + Math.max(0, Number(d && d.apples) || 0)
      }),
      { wood: 0, apples: 0 }
    );
  }

  function reqRemaining(r) {
    const del = reqDelivered(r);
    return {
      wood: Math.max(0, (Number(r && r.wood) || 0) - del.wood),
      apples: Math.max(0, (Number(r && r.apples) || 0) - del.apples)
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

  function resourceTokenFromImg(img) {
    const s = `${img.getAttribute("src") || ""} ${img.alt || ""} ${img.title || ""} ${img.className || ""}`.toLowerCase();
    if (/pomme|apple|food|nourri/.test(s)) return "🍎";
    if (/bois|wood|mat[eé]riau/.test(s)) return "🪵";
    return "";
  }

  function readBodyTextWithResourceIcons() {
    const swaps = [];
    try {
      document.body.querySelectorAll("img").forEach((img) => {
        if (!img.parentNode || (img.closest && img.closest("#fmz-gb-root, #fmz-gb-left-dock"))) return;
        const tok = resourceTokenFromImg(img);
        if (!tok) return;
        const t = document.createTextNode(` ${tok} `);
        img.parentNode.replaceChild(t, img);
        swaps.push([t, img]);
      });
      return document.body.innerText || "";
    } finally {
      swaps.forEach(([t, img]) => {
        if (t.parentNode) t.parentNode.replaceChild(img, t);
      });
    }
  }

  function extractResourceAmounts(lineText, containerEl = null) {
    const text = String(lineText || "");
    let wood = 0;
    let apples = 0;

    const pairRe = /(\d{1,3}(?:[\s\u00a0]\d{3})+|\d+)\s*(🍎|🪵|pommes?\b|nourriture\b|bois\b|mat[ée]riaux?\b)/gi;
    let pm;
    let foundPair = false;
    while ((pm = pairRe.exec(text)) !== null) {
      const n = parseLeadingFrNumber(pm[1]);
      if (n === null) continue;
      foundPair = true;
      if (/🍎|pomme|nourriture/i.test(pm[2])) apples = Math.max(apples, Math.floor(n));
      else wood = Math.max(wood, Math.floor(n));
    }
    if (foundPair) return { wood, apples };

    const woodPatterns = [
      /([\d\s\u00a0.,]+)\s*(?:🪵|bois\b|mat[ée]riaux?\b)/gi,
      /(?:🪵|bois\b|mat[ée]riaux?)\s*[:x×-]?\s*([\d\s\u00a0.,]+)/gi
    ];
    const applePatterns = [
      /([\d\s\u00a0.,]+)\s*(?:🍎|pommes?\b|nourriture\b)/gi,
      /(?:🍎|pommes?\b|nourriture)\s*[:x×-]?\s*([\d\s\u00a0.,]+)/gi
    ];

    for (const re of woodPatterns) {
      let m;
      while ((m = re.exec(text)) !== null) {
        const n = parseLeadingFrNumber(m[1]);
        if (n !== null && n > wood) wood = Math.floor(n);
      }
    }

    for (const re of applePatterns) {
      let m;
      while ((m = re.exec(text)) !== null) {
        const n = parseLeadingFrNumber(m[1]);
        if (n !== null && n > apples) apples = Math.floor(n);
      }
    }

    if (wood === 0 && apples === 0 && containerEl) {
      const imgs = Array.from(containerEl.querySelectorAll("img"));
      for (const img of imgs) {
        const src = String(img.getAttribute("src") || img.alt || "").toLowerCase();
        const nextText = (img.nextSibling && img.nextSibling.textContent) || "";
        const prevText = (img.previousSibling && img.previousSibling.textContent) || "";
        const qty = parseLeadingFrNumber(nextText) ?? parseLeadingFrNumber(prevText);
        if (qty !== null && qty > 0) {
          if (src.includes("bois") || src.includes("wood")) {
            wood += Math.floor(qty);
          } else if (src.includes("pomme") || src.includes("apple") || src.includes("food")) {
            apples += Math.floor(qty);
          }
        }
      }
    }

    if (wood === 0 && apples === 0) {
      const allNums = Array.from(text.matchAll(/\d{1,3}(?:[\s\u00a0]\d{3})+|\d+/g))
        .map((m) => parseLeadingFrNumber(m[0]))
        .filter((n) => n !== null);
      const nums = allNums.filter((n) => n > 0);
      if (allNums.length >= 2) {
        apples = Math.floor(allNums[0]);
        wood = Math.floor(allNums[1]);
      } else if (nums.length === 1) {
        const lower = text.toLowerCase();
        const idxApple = lower.search(/pomme|🍎/);
        const idxWood = lower.search(/bois|🪵/);
        if (idxApple !== -1 && (idxWood === -1 || idxApple < idxWood)) {
          apples = Math.floor(nums[0]);
        } else {
          wood = Math.floor(nums[0]);
        }
      }
    }

    return { wood, apples };
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

    const fullText = readBodyTextWithResourceIcons();
    const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed = [];
    const seenKeys = new Set();

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].replace(/^-+\s*/, "");
      if (!/(?:vous\s+allez\s+livrer|vous\s+allez\s+recevoir|convoi\s+vers|livraison\s+(?:vers|à|a))/i.test(line)) continue;

      if (!/\bdans\s+/i.test(line) && i + 1 < lines.length && /\bdans\s+/i.test(lines[i + 1])) {
        line = `${line} ${lines[i + 1].trim()}`;
      }

      const remSec = parseRemainingSeconds(line);
      if (remSec === null || remSec <= 0) continue;

      const isIncoming = /vous\s+allez\s+recevoir/i.test(line);
      const m = line.match(
        /(?:vous\s+allez\s+(?:livrer|recevoir)|livraison)\s+(.+?)\s+(?:à|a|vers|de|par)\s+([^\s]+(?:\s+[^\s]+)*?)\s+dans\s+/i
      );
      if (!m) continue;

      const resPart = m[1];
      const peerRaw = m[2].trim();
      const peerNorm = normalizePseudo(peerRaw);
      if (!peerNorm) continue;

      const fromName = isIncoming ? peerRaw : senderName;
      const toName = isIncoming ? senderName : peerRaw;
      const fromNorm = normalizePseudo(fromName);
      const toNorm = normalizePseudo(toName);

      const { wood, apples } = extractResourceAmounts(resPart);
      if (apples <= 0 && wood <= 0) continue;

      const arrivalAt = computeArrivalTimestamp(remSec, now, existingArrivals);
      const minuteBucket = Math.round(arrivalAt / 60000);
      const dedupeKey = `${fromNorm}|${toNorm}|${wood}|${apples}|${minuteBucket}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const id = `cv_${fromNorm}_${toNorm}_${apples}_${wood}_${minuteBucket}`;

      parsed.push({
        id,
        type: "convoy",
        from: findPlayerByPseudo(fromName) || { name: fromName, x: 0, y: 0, va: 0 },
        to: findPlayerByPseudo(toName) || { name: toName, x: 0, y: 0, va: 0 },
        duration: remSec,
        startAt: now,
        arrivalAt,
        wood,
        apples,
        createdBy: fromName
      });
    }

    return parsed;
  }

  function reconcileCommerceConvoys() {
    if (!IS_COMMERCE) return;
    const now = Date.now();
    const senderName = getDevUser();
    const detected = extractOngoingConvoysFromCommercePage();
    if (!detected.length) {
      lastCommerceSnapshotKey = "";
      return;
    }

    const movements = readCleanTimedArray(STORAGE_KEYS.movements, now);
    const dedupedMovements = movements.slice();
    const newlyDetected = [];

    for (const cv of detected) {
      const idx = dedupedMovements.findIndex((m) => isSameConvoy(m, cv));
      if (idx >= 0) {
        const prevSame = dedupedMovements[idx];
        cv.id = prevSame.id;
        cv.arrivalAt = prevSame.arrivalAt;
        cv.requestId = prevSame.requestId || "";
        dedupedMovements[idx] = { ...prevSame, ...cv };
      } else {
        dedupedMovements.push(cv);
        newlyDetected.push(cv);
      }
    }

    writeJsonArray(STORAGE_KEYS.movements, dedupedMovements);

    let requestsChanged = false;
    for (const cv of newlyDetected) {
      const fromName = (cv.from && cv.from.name) || cv.createdBy || senderName;
      const fromNorm = normalizePseudo(fromName);
      const destName = (cv.to && cv.to.name) || "";
      const destNorm = normalizePseudo(destName);
      const pendingMatch = consumePendingConvoyMatch(destNorm);

      let matchingReq = null;
      if (pendingMatch && pendingMatch.requestId) {
        matchingReq = convoyRequests.find(
          (r) => r && r.id === pendingMatch.requestId && r.status !== "done" && !isOwnRequest(r, fromName)
        );
      }

      if (!matchingReq) {
        matchingReq = convoyRequests
          .filter((r) => r && r.status !== "done" && normalizePseudo(r.player) === destNorm && !isOwnRequest(r, fromName))
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
          by: fromName,
          loggedBy: senderName,
          wood: appliedWood > 0 ? appliedWood : cv.wood,
          apples: appliedApples > 0 ? appliedApples : cv.apples,
          at: now,
          arrivalAt: cv.arrivalAt,
          movementId: cv.id
        };
        const dupDelivery = matchingReq.deliveries.some(
          (d) =>
            d &&
            (String(d.movementId || "") === String(delivery.movementId || "") ||
              (normalizePseudo(d.by) === normalizePseudo(delivery.by) &&
                Number(d.wood || 0) === Number(delivery.wood || 0) &&
                Number(d.apples || 0) === Number(delivery.apples || 0) &&
                Math.abs(Number(d.arrivalAt || 0) - Number(delivery.arrivalAt || 0)) <= 180000))
        );
        if (dupDelivery) continue;
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
          normalizePseudo(item.from) === fromNorm &&
          normalizePseudo(item.to) === destNorm &&
          Number(item.wood || 0) === Number(cv.wood || 0) &&
          Number(item.apples || 0) === Number(cv.apples || 0) &&
          Math.abs(Number(item.arrivalAt || 0) - Number(cv.arrivalAt || 0)) <= 180000
      );
      if (!alreadyLogged) {
        convoyLog.push({
          from: fromName,
          to: destName || "Destinataire",
          wood: cv.wood,
          apples: cv.apples,
          requestId: cv.requestId || "",
          arrivalAt: cv.arrivalAt
        });
      }
      syncWithWorker({ kind: "movements", action: "create", movement: cv }, `convoy_${cv.id}`);
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
      createdBy: devUser,
      _pending: true
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

  function formatTdcChangeBadge(label, beforeVal, afterVal, deltaVal) {
    if (beforeVal == null || beforeVal <= 0) {
      return `<span class="fmz-gb-tdc-delta fmz-gb-tdc-flat">${esc(label)} : ?</span>`;
    }
    const cleanAfter = afterVal != null ? afterVal : beforeVal;
    const rawDelta = deltaVal !== undefined && deltaVal !== null ? deltaVal : (cleanAfter - beforeVal);
    if (rawDelta === 0 || beforeVal === cleanAfter) {
      return `<span class="fmz-gb-tdc-delta fmz-gb-tdc-flat">${esc(label)} : ${formatNumber(beforeVal)} (0)</span>`;
    }
    const isGain = rawDelta > 0;
    const cls = isGain ? "fmz-gb-tdc-up" : "fmz-gb-tdc-down";
    const sign = isGain ? "+" : "-";
    const diffAbs = Math.abs(rawDelta);
    return `<span class="fmz-gb-tdc-delta ${cls}">${esc(label)} : ${formatNumber(beforeVal)} → ${formatNumber(cleanAfter)} (${sign}${formatNumber(diffAbs)})</span>`;
  }

  function injectGlobalBubbleStyles() {
    if (!document.body && !document.head) return;
    if (document.getElementById("fmz-global-bubble-style")) return;
    const style = document.createElement("style");
    style.id = "fmz-global-bubble-style";
    style.textContent = `
      @keyframes fmzUpdateBlink {
        0%, 100% {
          background:rgba(153,27,27,.95);
          border-color:#f87171;
          color:#ffffff;
          box-shadow:0 0 12px rgba(239,68,68,.85);
        }
        50% {
          background:rgba(239,68,68,.98);
          border-color:#fecaca;
          color:#ffffff;
          box-shadow:0 0 22px rgba(248,113,113,1);
        }
      }
      @keyframes fmzHudEnter {
        from { opacity:0; transform:translateY(6px) scale(.99); }
        to { opacity:1; transform:translateY(0) scale(1); }
      }
      #fmz-gb-left-dock{
        position:fixed;left:12px;bottom:14px;z-index:10000;
        display:flex;flex-direction:column;align-items:flex-start;gap:6px;
        font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
        font-size:12px;color:#e2e8f0;font-variant-numeric:tabular-nums;
      }
      #fmz-gb-root{
        position:fixed;right:12px;bottom:14px;z-index:10000;
        display:flex;flex-direction:column;align-items:flex-end;gap:8px;
        font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
        font-size:12px;color:#e2e8f0;font-variant-numeric:tabular-nums;
      }
      #fmz-gb-root.has-armee-badge #fmz-gb-card{margin-bottom:44px}
      #fmz-gb-root *, #fmz-gb-left-dock *{box-sizing:border-box}
      .fmz-gb-dock{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .fmz-gb-fab{
        display:inline-flex;align-items:center;gap:6px;text-decoration:none;
        background:linear-gradient(135deg,rgba(15,23,42,.92),rgba(17,24,39,.92));
        color:#e2e8f0;border:1px solid rgba(56,189,248,.32);
        box-shadow:0 6px 18px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07);
        backdrop-filter:blur(10px);
        border-radius:999px;padding:7px 11px;cursor:pointer;
        font-weight:700;font-size:12px;user-select:none;
        transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease,background .14s ease;
      }
      .fmz-gb-fab:hover{
        background:linear-gradient(135deg,rgba(30,41,59,.96),rgba(15,23,42,.96));
        border-color:rgba(34,211,238,.7);
        box-shadow:0 8px 22px rgba(0,0,0,.65),0 0 14px rgba(34,211,238,.22);
        color:#ffffff;transform:translateY(-1px);
      }
      .fmz-gb-fab.alert{
        background:linear-gradient(135deg,rgba(127,29,29,.94),rgba(69,10,10,.94));
        border-color:rgba(248,113,113,.75);color:#fff;
        box-shadow:0 6px 20px rgba(127,29,29,.45),0 0 14px rgba(239,68,68,.3);
      }
      .fmz-gb-fab.convoy.active, .fmz-gb-fab.alliance.active, .fmz-gb-fab.stats.active, .fmz-gb-fab.players.active{
        background:linear-gradient(135deg,rgba(8,145,178,.42),rgba(30,58,138,.82));
        border-color:#22d3ee;color:#ecfeff;
        box-shadow:0 0 16px rgba(34,211,238,.35);
      }
      .fmz-gb-fab.update{
        background:linear-gradient(135deg,rgba(6,95,70,.85),rgba(15,23,42,.92));
        border-color:rgba(52,211,153,.55);color:#d1fae5;
      }
      .fmz-gb-fab.update:hover{border-color:#34d399;color:#fff}
      .fmz-gb-fab.update.needs-update{
        animation:fmzUpdateBlink 1s infinite ease-in-out;
      }
      .fmz-gb-pill{
        background:rgba(2,6,23,.8);border:1px solid rgba(56,189,248,.35);border-radius:999px;
        padding:1px 7px;font-size:11px;color:#67e8f9;font-weight:700;
      }
      .fmz-gb-fab.alert .fmz-gb-pill{
        background:rgba(69,10,10,.88);border-color:rgba(252,165,165,.6);color:#fecaca;
      }
      #fmz-gb-card, .fmz-gb-card{
        width:min(372px, calc(100vw - 24px));
        max-height:calc(100vh - 125px);
        overflow-y:auto;
        background:linear-gradient(180deg,rgba(11,18,32,.95),rgba(15,23,42,.95)) !important;
        color:#e2e8f0 !important;
        opacity:1 !important;
        border:1px solid rgba(56,189,248,.35);
        border-radius:14px;
        padding:11px;
        box-shadow:0 16px 36px rgba(0,0,0,.78),0 0 24px rgba(14,165,233,.12),inset 0 1px 0 rgba(255,255,255,.08);
        backdrop-filter:blur(12px);
        animation:fmzHudEnter .16s ease-out;
      }
      #fmz-gb-card.fmz-player-page{
        position:fixed;
        inset:12px;
        width:auto;
        max-width:none;
        max-height:none;
        margin:0 !important;
        z-index:10020;
        border-radius:16px;
        padding:14px;
      }
      .fmz-gb-head{
        display:flex;justify-content:space-between;align-items:center;
        gap:6px;padding-bottom:8px;margin-bottom:8px;
        border-bottom:1px solid rgba(56,189,248,.22);
      }
      .fmz-gb-head b{font-size:13px;color:#f8fafc;letter-spacing:.02em}
      .fmz-gb-head-actions{display:flex;gap:5px;align-items:center}
      .fmz-gb-btn{
        background:rgba(30,41,59,.9) !important;color:#f1f5f9 !important;
        border:1px solid rgba(148,163,184,.35);
        border-radius:7px;padding:4px 8px;min-height:26px;cursor:pointer;
        font-size:11px;font-weight:700;
        transition:background .12s ease,border-color .12s ease;
      }
      .fmz-gb-btn:hover{background:rgba(51,65,85,.95) !important;border-color:#38bdf8}
      .fmz-gb-btn.primary{
        background:linear-gradient(135deg,#059669,#047857) !important;
        border-color:#34d399;color:#ecfdf5 !important;
      }
      .fmz-gb-btn.accent{
        background:linear-gradient(135deg,#0284c7,#1d4ed8) !important;
        border-color:#38bdf8;color:#f0f9ff !important;
      }
      .fmz-gb-filters{
        display:flex;gap:5px;margin-bottom:6px;
      }
      .fmz-gb-filter-btn{
        flex:1;background:rgba(9,15,28,.85) !important;color:#94a3b8 !important;
        border:1px solid rgba(56,189,248,.18);border-radius:7px;padding:5px 6px;min-height:26px;
        cursor:pointer;font-size:11px;font-weight:700;text-align:center;
        transition:all .12s ease;
      }
      .fmz-gb-filter-btn.active{
        background:rgba(8,145,178,.28) !important;color:#67e8f9 !important;
        border-color:#22d3ee;box-shadow:0 0 10px rgba(34,211,238,.18);
      }
      .fmz-gb-status-bar{
        display:flex;justify-content:space-between;align-items:center;gap:6px;
        font-size:11px;color:#94a3b8;margin-bottom:8px;padding:0 2px;
      }
      .fmz-gb-sync-badge{
        display:inline-flex;align-items:center;gap:6px;color:#cbd5e1;font-weight:600;
      }
      .fmz-gb-sync-badge::before{
        content:"";width:7px;height:7px;border-radius:999px;
        background:#64748b;box-shadow:0 0 6px rgba(100,116,139,.6);
      }
      .fmz-gb-sync-badge.ok::before{background:#34d399;box-shadow:0 0 8px rgba(52,211,153,.85)}
      .fmz-gb-sync-badge.syncing::before{background:#22d3ee;box-shadow:0 0 8px rgba(34,211,238,.85)}
      .fmz-gb-sync-badge.backoff::before{background:#fbbf24;box-shadow:0 0 8px rgba(251,191,36,.8)}
      .fmz-gb-sync-badge.error::before{background:#f87171;box-shadow:0 0 8px rgba(248,113,113,.85)}
      .fmz-gb-link{color:#38bdf8;text-decoration:none;font-weight:700}
      .fmz-gb-link:hover{color:#7dd3fc;text-decoration:underline}
      .fmz-gb-account-box{
        background:rgba(9,15,28,.88);border:1px solid rgba(56,189,248,.35);border-radius:10px;
        padding:8px;margin-bottom:8px;
      }
      .fmz-gb-account-row{display:flex;gap:6px;margin-top:6px}
      .fmz-gb-account-input{
        flex:1;background:#0f172a;color:#f8fafc;border:1px solid rgba(56,189,248,.4);
        border-radius:7px;padding:5px 8px;font-size:12px;
      }
      .fmz-gb-sec{
        background:rgba(9,15,28,.84);border:1px solid rgba(56,189,248,.18);border-radius:10px;
        padding:8px 9px;margin-bottom:7px;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
      }
      .fmz-gb-sec:last-child{margin-bottom:0}
      .fmz-gb-sec.danger{border-left:3px solid #f87171}
      .fmz-gb-sec.urgent{border-color:rgba(248,113,113,.65);background:rgba(69,10,10,.36)}
      .fmz-gb-sec.in{border-left:3px solid #34d399}
      .fmz-gb-sec.hunt{border-left:3px solid #fbbf24}
      .fmz-gb-sec.out{border-left:3px solid #38bdf8}
      .fmz-gb-sec-title{
        display:flex;justify-content:space-between;align-items:center;
        font-weight:700;font-size:11px;letter-spacing:.04em;text-transform:uppercase;
        color:#e2e8f0;cursor:pointer;user-select:none;
      }
      .fmz-gb-sec-body{margin-top:6px}
      .fmz-gb-sec.collapsed .fmz-gb-sec-body{display:none}
      .fmz-gb-row{padding:6px 4px;border-top:1px solid rgba(148,163,184,.12);line-height:1.35}
      .fmz-gb-row.soon{background:rgba(239,68,68,.14);padding:6px 7px;border-radius:8px}
      .fmz-gb-row.targeted-me{border-left:2px solid #f87171;padding-left:7px}
      .fmz-gb-row.will-fail{background:rgba(245,158,11,.14);border-left:2px solid #fbbf24;padding:6px 7px;border-radius:8px}
      .fmz-gb-row:first-of-type{border-top:none;padding-top:2px}
      .fmz-gb-row-top{display:flex;justify-content:space-between;align-items:center;gap:6px}
      .fmz-gb-cd{white-space:nowrap;font-weight:700;font-size:11px;color:#67e8f9}
      .fmz-gb-cd.critical{color:#fecaca;background:rgba(153,27,27,.85);padding:1px 6px;border-radius:5px;border:1px solid rgba(248,113,113,.5)}
      .fmz-gb-cd.warn{color:#fde68a}
      .fmz-gb-sub{color:#94a3b8;font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .fmz-gb-tdc{color:#cbd5e1;font-size:11px;margin-top:2px}
      .fmz-gb-tdc-line{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:4px;font-size:11px}
      .fmz-gb-tdc-delta{display:inline-flex;align-items:center;gap:3px;font-weight:700;padding:1px 6px;border-radius:6px}
      .fmz-gb-tdc-down{color:#fca5a5;background:rgba(127,29,29,.45);border:1px solid rgba(248,113,113,.45)}
      .fmz-gb-tdc-up{color:#6ee7b7;background:rgba(6,78,59,.45);border:1px solid rgba(52,211,153,.45)}
      .fmz-gb-tdc-flat{color:#cbd5e1;background:rgba(30,41,59,.75);border:1px solid rgba(148,163,184,.25)}
      .fmz-gb-rule{color:#6ee7b7;font-size:11px;margin-top:2px}
      .fmz-gb-fail{color:#fbbf24;font-size:11px;font-weight:700;margin-top:2px}
      .fmz-gb-prog{
        height:4px;background:rgba(30,41,59,.9);border-radius:999px;
        overflow:hidden;margin-top:5px;border:1px solid rgba(56,189,248,.15);
      }
      .fmz-gb-prog > span{
        display:block;height:100%;
        background:linear-gradient(90deg,#22d3ee,#34d399);
        border-radius:999px;
      }
      .fmz-gb-empty{color:#94a3b8;font-size:11px}
      .fmz-gb-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:5px}
      .fmz-gb-lbl{display:block;color:#94a3b8;font-size:11px;margin-top:5px}
      .fmz-gb-inp{
        width:100%;background:#0f172a;color:#f8fafc;border:1px solid rgba(56,189,248,.32);
        border-radius:7px;padding:5px 8px;font-size:12px;margin-top:2px;
        font-variant-numeric:tabular-nums;
      }
      .fmz-gb-inp:focus{outline:none;border-color:#22d3ee}
      .fmz-gb-actions{display:flex;gap:6px;margin-top:7px}
      .fmz-gb-actions button{flex:1}
      .fmz-gb-msg{margin-top:6px;font-size:11px;color:#6ee7b7}
      .fmz-gb-msg.warn{color:#fca5a5}
      .fmz-gb-player{
        display:flex;justify-content:space-between;align-items:center;gap:6px;
        width:100%;background:rgba(9,15,28,.86) !important;color:#f1f5f9 !important;
        border:1px solid rgba(56,189,248,.18);border-radius:8px;padding:7px 9px;margin-bottom:5px;
        cursor:pointer;font-size:12px;text-align:left;
        transition:border-color .12s ease,background .12s ease;
      }
      .fmz-gb-player:hover{background:rgba(15,23,42,.96) !important;border-color:#22d3ee}
      .fmz-gb-player.me{border-left:3px solid #34d399}
      .fmz-gb-player.attacked{border-left:3px solid #f87171}
      .fmz-gb-player-tdc{color:#94a3b8;font-size:11px;margin-left:6px}
      .fmz-gb-atk-dot{
        display:inline-flex;align-items:center;justify-content:center;
        min-width:18px;height:18px;padding:0 5px;border-radius:999px;
        font-size:10px;font-weight:800;line-height:1;
      }
      .fmz-gb-atk-dot.ok{
        background:rgba(16,185,129,.22);color:#6ee7b7;border:1px solid rgba(52,211,153,.65);
        box-shadow:0 0 8px rgba(16,185,129,.35);
      }
      .fmz-gb-atk-dot.no{
        background:rgba(239,68,68,.24);color:#fca5a5;border:1px solid rgba(248,113,113,.7);
        box-shadow:0 0 8px rgba(239,68,68,.35);
      }
      .fmz-gb-atk-dot.na{
        background:rgba(100,116,139,.25);color:#cbd5e1;border:1px solid rgba(148,163,184,.35);
      }
      .fmz-gb-badge{
        background:rgba(30,41,59,.9);color:#e2e8f0;border-radius:999px;
        padding:2px 7px;font-size:11px;font-weight:700;min-width:22px;text-align:center;
        border:1px solid rgba(148,163,184,.25);
      }
      .fmz-gb-badge.alert{background:rgba(153,27,27,.85);color:#fecaca;border:1px solid rgba(248,113,113,.65)}
      .fmz-gb-summary{
        background:rgba(9,15,28,.88);border:1px solid rgba(56,189,248,.24);border-radius:10px;
        padding:8px 9px;margin-bottom:7px;font-size:11px;line-height:1.55;color:#cbd5e1;
      }
      .fmz-gb-tabs{
        display:flex;gap:6px;margin-bottom:10px;
      }
      .fmz-gb-tab{
        flex:1;background:rgba(9,15,28,.88) !important;color:#94a3b8 !important;
        border:1px solid rgba(56,189,248,.2);border-radius:8px;padding:7px 8px;
        cursor:pointer;font-size:11px;font-weight:700;text-align:center;
      }
      .fmz-gb-tab.active{
        background:rgba(8,145,178,.32) !important;color:#ecfeff !important;
        border-color:#22d3ee;
      }
      .fmz-gb-lvl-grid{
        display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:6px;
      }
      .fmz-gb-lvl-card{
        background:rgba(9,15,28,.88);border:1px solid rgba(56,189,248,.18);
        border-radius:8px;padding:7px 8px;font-size:11px;
      }
      .fmz-gb-lvl-name{color:#e2e8f0;font-weight:700}
      .fmz-gb-lvl-val{color:#67e8f9;font-weight:800;margin-top:2px}
      .fmz-gb-lvl-prog{color:#fbbf24;font-size:10px;margin-top:2px}
    `;
    (document.head || document.body).appendChild(style);
  }

  function renderSyncStatusHtml() {
    const st = String(syncStatus.state || "idle");
    return `<span class="fmz-gb-sync-badge ${esc(st)}">${esc(syncStatus.label)}</span>`;
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
        if (!isCleanPlayerName(pName)) continue;
        registerAllianceMemberPseudo(pName);
        if (!isKnownAllianceMemberName(pName)) continue;
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
    const knownKeys = getKnownAllianceKeys();
    const playersFromMap = Object.entries(tdcMap)
      .filter(
        ([k, v]) =>
          k &&
          !k.startsWith("_") &&
          knownKeys.has(normalizePseudo((v && v.pseudo) || k)) &&
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
          ${renderSyncStatusHtml()}
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
    const outOfRangeCount = filteredAttacks.filter((a) => getAttackTdcSummary(a).willFail).length;

    const summaryLine = filteredAttacks.length
      ? `<div class="fmz-gb-summary">⚔️ <b>${filteredAttacks.length}</b> attaque(s) affichée(s) · <b>${incomingCount}</b> sur moi · <b>${outgoingCount}</b> lancées${outOfRangeCount > 0 ? ` · <span style="color:#fbbf24;font-weight:700">${outOfRangeCount} hors plage</span>` : ""}</div>`
      : "";

    const attacksListHtml = !filteredAttacks.length
      ? `<div class="fmz-gb-empty">Aucune attaque correspondant à ce filtre.</div>`
      : filteredAttacks
          .map((a) => {
            const leftSec = Math.max(0, Math.ceil((Number(a.arrivalAt || 0) - now) / 1000));
            const isCritical = leftSec <= 15 * 60;
            const isWarn = leftSec <= 30 * 60;
            const urgencyClass = isCritical ? "critical" : isWarn ? "warn" : "";
            const isMeTarget = samePseudo(a.target, devUser);
            const isMeAttacker = samePseudo(a.attacker, devUser);

            const atkLabel = isMeAttacker ? `${esc(a.attacker || "Moi")} (moi)` : esc(a.attacker || "Inconnu");
            const defLabel = isMeTarget
              ? `<span style="color:#fca5a5;font-weight:700">${esc(a.target || "?")} (moi)</span>`
              : `<b>${esc(a.target || "?")}</b>`;

            const sentAnts = getAttackSentAnts(a);
            const atkTdc = getAttackerTdcSummary(a);
            const defTdc = getAttackTdcSummary(a);
            const willFail = defTdc.willFail;

            const arrivalTxt = a.arrivalLabel
              ? esc(a.arrivalLabel)
              : new Date(Number(a.arrivalAt || now)).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

            const badges = [];
            if (atkTdc.hasTdc) {
              const atkAfter = !willFail && atkTdc.taken > 0 ? atkTdc.afterTdc : atkTdc.beforeTdc;
              const atkDelta = !willFail && atkTdc.taken > 0 ? atkTdc.taken : 0;
              badges.push(formatTdcChangeBadge(isMeAttacker ? "Moi" : a.attacker || "Attaquant", atkTdc.beforeTdc, atkAfter, atkDelta));
            }
            if (defTdc.hasTdc) {
              const defAfter = !willFail && defTdc.taken > 0 ? defTdc.afterTdc : defTdc.beforeTdc;
              const defDelta = !willFail && defTdc.taken > 0 ? -defTdc.taken : 0;
              badges.push(formatTdcChangeBadge(isMeTarget ? "Moi" : a.target || "Cible", defTdc.beforeTdc, defAfter, defDelta));
            }

            const tdcBlock = badges.length
              ? `<div class="fmz-gb-tdc-line">${badges.join("")}</div>`
              : `<div class="fmz-gb-sub">TDC non chargé · <a class="fmz-gb-link" href="${esc(SHORTCUT_LINKS.membersUrl)}">ouvrir Membres</a></div>`;

            let detailNote = "";
            if (willFail) {
              detailNote = `<div class="fmz-gb-fail">⚠️ Hors 50%–300% (0 cm²) : ${esc(defTdc.failReason)}</div>`;
            } else if (defTdc.hasTdc && defTdc.taken > 0) {
              const ratioTxt = defTdc.ratioPct != null ? ` · ${defTdc.ratioPct}%` : "";
              detailNote = `<div class="fmz-gb-sub">Prise max : ${formatNumber(defTdc.taken)} cm²${ratioTxt}</div>`;
            }

            const antsTxt = sentAnts > 0 ? `🐜 ${formatNumber(sentAnts)}` : "🐜 effectif ?";

            return `
              <div class="fmz-gb-row ${isWarn ? "soon" : ""} ${isMeTarget ? "targeted-me" : ""} ${willFail ? "will-fail" : ""}">
                <div class="fmz-gb-row-top">
                  <span>${willFail ? "⚠️" : isCritical ? "🚨" : "⚔️"} <b>${atkLabel}</b> → ${defLabel}</span>
                  <span class="fmz-gb-cd ${urgencyClass}" data-cd="${a.arrivalAt}">${formatDuration(leftSec)}</span>
                </div>
                <div class="fmz-gb-sub">🕒 ${arrivalTxt} · ${antsTxt}${a.targetKind ? ` · ${esc(a.targetKind)}` : ""}</div>
                ${tdcBlock}
                ${detailNote}
              </div>
            `;
          })
          .join("");

    return `
      <div id="fmz-gb-card">
        <div class="fmz-gb-head">
          <b>🛡️ Alliance · Attaques</b>
          <div class="fmz-gb-head-actions">
            <button id="fmz-gb-refresh" class="fmz-gb-btn" type="button" title="Rafraîchir maintenant">🔄</button>
            <button id="fmz-gb-al-close" class="fmz-gb-btn" type="button" title="Réduire">_</button>
          </div>
        </div>

        <div class="fmz-gb-status-bar">
          ${renderSyncStatusHtml()}
          <a class="fmz-gb-link" href="${esc(SHORTCUT_LINKS.membersUrl)}">📋 Membres (TDC)</a>
        </div>

        ${summaryLine}

        <div class="fmz-gb-filters">
          <button class="fmz-gb-filter-btn ${allianceAttackFilter === "all" ? "active" : ""}" data-al-filter="all" type="button">Tout (${rawAttacks.length})</button>
          <button class="fmz-gb-filter-btn ${allianceAttackFilter === "incoming" ? "active" : ""}" data-al-filter="incoming" type="button">Sur moi (${incomingCount})</button>
          <button class="fmz-gb-filter-btn ${allianceAttackFilter === "outgoing" ? "active" : ""}" data-al-filter="outgoing" type="button">Mes attaques (${outgoingCount})</button>
        </div>

        <div class="fmz-gb-filters">
          <button class="fmz-gb-filter-btn ${allianceAttackSort === "time" ? "active" : ""}" data-al-sort="time" type="button">⏱️ Arrivée</button>
          <button class="fmz-gb-filter-btn ${allianceAttackSort === "tdc" ? "active" : ""}" data-al-sort="tdc" type="button">📐 Plus gros impact</button>
        </div>

        ${renderSectionBlock(
          "al_attacks",
          "⚔️ Attaques en cours",
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
            const totalReq = (Number(r.wood) || 0) + (Number(r.apples) || 0);
            const totalDel = (Number(del.wood) || 0) + (Number(del.apples) || 0);
            const pctDone = totalReq > 0 ? Math.min(100, Math.round((totalDel / totalReq) * 100)) : 0;

            const statusText = hasDelivered
              ? `Livré 🪵 ${formatNumber(del.wood)} · 🍎 ${formatNumber(del.apples)} (${pctDone}%) / Reste 🪵 ${formatNumber(rem.wood)} · 🍎 ${formatNumber(rem.apples)}`
              : `Ouverte · Reste 🪵 ${formatNumber(rem.wood)} · 🍎 ${formatNumber(rem.apples)}`;

            const progHtml = hasDelivered
              ? `<div class="fmz-gb-prog"><span style="width:${pctDone}%"></span></div>`
              : "";

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
                ${progHtml}
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
          ${renderSyncStatusHtml()}
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
        renderGlobalBubble(true);
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
          renderGlobalBubble(true);
        } else if (act === "max") {
          convoyDrafts[r.id] = { wood: rem.wood, apples: rem.apples };
          lastCommerceMessage = `✓ Max sélectionné pour ${r.player}.`;
          renderGlobalBubble(true);
        } else if (act === "send") {
          const card = btn.closest("[data-cv-card]");
          const wInp = card?.querySelector('[data-cv-df="wood"]');
          const aInp = card?.querySelector('[data-cv-df="apples"]');
          setConvoyBubbleOpen(false);
          renderGlobalBubble(true);
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
    const knownKeys = getKnownAllianceKeys();

    for (const p of DEFAULT_PLAYERS) {
      const display = playerDisplayName(p.name);
      const key = normalizePseudo(display);
      if (!key || !display || !knownKeys.has(key)) continue;
      const storedEntry = tdcMap[key];
      const tdcVal =
        storedEntry && typeof storedEntry.tdc === "number" && storedEntry.tdc > 0
          ? Math.floor(storedEntry.tdc)
          : (typeof p.tdc === "number" && p.tdc > 0 ? Math.floor(p.tdc) : null);
      const atkEval = evaluateTargetAttackability(display, getDevUser(), now);
      byKey.set(key, {
        key,
        name: display,
        tdc: tdcVal,
        count: 0,
        hunts: 0,
        attackEval: atkEval
      });
    }

    for (const [k, v] of Object.entries(tdcMap || {})) {
      if (!k || k.startsWith("_") || !v || typeof v !== "object") continue;
      const display = playerDisplayName(v.pseudo || k);
      const key = normalizePseudo(display);
      if (!key || !display || !isCleanPlayerName(display) || !knownKeys.has(key)) continue;
      const tdcVal = typeof v.tdc === "number" && v.tdc > 0 ? Math.floor(v.tdc) : null;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          name: display,
          tdc: tdcVal,
          count: 0,
          hunts: 0,
          attackEval: evaluateTargetAttackability(display, getDevUser(), now)
        });
      } else if (tdcVal != null) {
        byKey.get(key).tdc = tdcVal;
      }
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

  function renderLevelGridHtml(entriesObj, emptyMsg, sourceUrl) {
    const entries = Object.entries(entriesObj || {}).sort((a, b) => a[0].localeCompare(b[0], "fr"));
    if (!entries.length) {
      return `<div class="fmz-gb-empty">${esc(emptyMsg)} · <a class="fmz-gb-link" href="${esc(sourceUrl)}">Ouvrir la page</a></div>`;
    }
    return `
      <div class="fmz-gb-lvl-grid">
        ${entries
          .map(([name, info]) => {
            const lvl = info && info.level != null ? info.level : 0;
            const target = info && info.targetLevel != null ? info.targetLevel : null;
            return `
              <div class="fmz-gb-lvl-card">
                <div class="fmz-gb-lvl-name">${esc(name)}</div>
                <div class="fmz-gb-lvl-val">Niveau ${esc(lvl)}</div>
                ${target != null ? `<div class="fmz-gb-lvl-prog">En cours → niv. ${esc(target)}</div>` : ""}
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function buildPlayersBubbleHtml(devUser, now, collapsedMap) {
    const players = getKnownPlayers(now);
    const meKey = normalizePseudo(devUser);
    const selected = selectedPlayerKey ? players.find((p) => p.key === selectedPlayerKey) : null;

    if (!selected) {
      const listHtml = !players.length
        ? `<div class="fmz-gb-empty">Aucun joueur ${OWN_ALLIANCE_TAG} enregistré (ouvre la page Membres).</div>`
        : players
            .map((p) => {
              const isMe = p.key === meKey;
              const ev = p.attackEval || {};
              const dotClass = ev.attackable === true ? "ok" : (ev.attackable === false ? "no" : "na");
              const dotTxt = isMe
                ? "MOI"
                : (ev.attackable === true ? "OK" : (ev.attackable === false ? "NON" : "?"));
              const tdcTxt = p.tdc ? `${formatNumber(p.tdc)} cm²` : "TDC ?";
              const metaBits = [];
              if (p.count > 0) metaBits.push(`⚔️${p.count}`);
              if (p.hunts > 0) metaBits.push(`🏹${p.hunts}`);
              const rightMeta = metaBits.length
                ? `<span class="fmz-gb-badge ${p.count > 0 ? "alert" : ""}">${metaBits.join(" ")}</span>`
                : "";
              return `
                <button class="fmz-gb-player ${isMe ? "me" : ""} ${p.count > 0 ? "attacked" : ""}" data-pl-select="${esc(p.key)}" type="button">
                  <span>
                    <b>${esc(p.name)}</b>${isMe ? " (moi)" : ""}
                    <span class="fmz-gb-player-tdc">· ${esc(tdcTxt)}</span>
                  </span>
                  <span style="display:flex;align-items:center;gap:5px">
                    <span class="fmz-gb-atk-dot ${dotClass}" title="${esc(ev.reason || "")}">${esc(dotTxt)}</span>
                    ${rightMeta}
                  </span>
                </button>
              `;
            })
            .join("");

      return `
        <div id="fmz-gb-card">
          <div class="fmz-gb-head">
            <b>👤 Joueurs ${OWN_ALLIANCE_TAG} (${players.length})</b>
            <div class="fmz-gb-head-actions">
              <button id="fmz-gb-refresh" class="fmz-gb-btn" type="button" title="Rafraîchir maintenant">🔄</button>
              <button id="fmz-gb-pl-list-close" class="fmz-gb-btn" type="button" title="Réduire">_</button>
            </div>
          </div>

          <div class="fmz-gb-status-bar">
            ${renderSyncStatusHtml()}
            <a class="fmz-gb-link" href="${esc(SHORTCUT_LINKS.membersUrl)}">📋 Membres (TDC)</a>
          </div>

          <div class="fmz-gb-summary">
            Règle <b>50%–300%</b> vs <b>${esc(devUser)}</b> : <span class="fmz-gb-atk-dot ok">OK</span> attaquable · <span class="fmz-gb-atk-dot no">NON</span> hors plage · <span class="fmz-gb-atk-dot na">?</span> TDC inconnu
          </div>

          <div>${listHtml}</div>
        </div>
      `;
    }

    if (selected) {
      const attacks = getAllAllianceAttacks(now).filter((a) => normalizePseudo(a.target) === selected.key);
      const hunts = getAllActiveHunts(now).filter((h) => normalizePseudo(h.player) === selected.key);
      const playerConvoys = getConvoySummaryForUser(selected.name, now);
      const sim = getTdcChains();
      const currentTdc = getPlayerTdc(selected.name);
      const projected = sim.finalTdc && sim.finalTdc.has(selected.key) ? sim.finalTdc.get(selected.key) : null;
      const profile = getPlayerProfile(selected.name);
      const vaVal = getPlayerAttackSpeed(selected.name);
      const atkEval = selected.attackEval || evaluateTargetAttackability(selected.name, devUser, now);
      const isMe = selected.key === meKey;

      let totalTaken = 0;
      attacks.forEach((a) => {
        const ch = sim.attacks.get(String(a.sig || a.id));
        if (ch && !ch.willFail) {
          totalTaken += ch.taken || 0;
        }
      });

      const dotClass = atkEval.attackable === true ? "ok" : (atkEval.attackable === false ? "no" : "na");
      const dotText = atkEval.attackable === true ? "ATTAQUABLE" : (atkEval.attackable === false ? "NON ATTAQUABLE" : "TDC ?");
      const attackStatusBadge = isMe
        ? `<span class="fmz-gb-atk-dot na">MOI</span>`
        : `<span class="fmz-gb-atk-dot ${dotClass}">${dotText}</span>`;

      const tdcBadgeHtml = currentTdc
        ? formatTdcChangeBadge(
            "TDC",
            currentTdc,
            projected != null ? projected : currentTdc,
            projected != null ? (projected - currentTdc) : 0
          )
        : `<span class="fmz-gb-tdc-delta fmz-gb-tdc-flat">TDC : inconnu</span>`;

      const overviewTabHtml = `
        <div class="fmz-gb-summary">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px">
            <b>🎯 Règle 50%–300% (vs ${esc(devUser)})</b>
            ${attackStatusBadge}
          </div>
          <div>${esc(atkEval.reason)}</div>
          <div class="fmz-gb-tdc-line">${tdcBadgeHtml}</div>
          <div style="margin-top:6px">
            ⚡ Vitesse d'attaque (VA) : <b>${vaVal != null ? `niveau ${esc(vaVal)}` : "non renseignée"}</b><br>
            ⚔️ Attaques sur lui : <b>${attacks.length}</b> · 📉 Pris max : <b>${formatNumber(totalTaken)} cm²</b> · 🏹 Chasses : <b>${hunts.length}</b><br>
            🚚 Convois entrants : <b>${playerConvoys.incoming.length}</b> · sortants : <b>${playerConvoys.outgoing.length}</b>
          </div>
          ${
            isMe
              ? `
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,.18)">
                  <label class="fmz-gb-lbl" for="fmz-pl-va-input">⚡ Vitesse d'attaque (auto sur Laboratoire ou saisie manuelle)</label>
                  <div class="fmz-gb-account-row">
                    <input id="fmz-pl-va-input" class="fmz-gb-account-input" type="number" min="0" step="1" value="${vaVal != null ? esc(vaVal) : ""}" placeholder="Ex : 9">
                    <button id="fmz-pl-va-save" class="fmz-gb-btn primary" type="button">Enregistrer</button>
                  </div>
                </div>
              `
              : ""
          }
        </div>
        ${renderSectionBlock(
          "pl_attacks",
          "⚔️ Attaques en cours sur ce joueur",
          attacks.length,
          !attacks.length
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
                  const badges = [];
                  if (defTdc.hasTdc) {
                    const defAfter = !willFail && defTdc.taken > 0 ? defTdc.afterTdc : defTdc.beforeTdc;
                    const defDelta = !willFail && defTdc.taken > 0 ? -defTdc.taken : 0;
                    badges.push(formatTdcChangeBadge(selected.name, defTdc.beforeTdc, defAfter, defDelta));
                  }
                  if (atkTdc.hasTdc) {
                    const atkAfter = !willFail && atkTdc.taken > 0 ? atkTdc.afterTdc : atkTdc.beforeTdc;
                    const atkDelta = !willFail && atkTdc.taken > 0 ? atkTdc.taken : 0;
                    badges.push(formatTdcChangeBadge(a.attacker || "Attaquant", atkTdc.beforeTdc, atkAfter, atkDelta));
                  }
                  return `
                    <div class="fmz-gb-row ${isWarn ? "soon" : ""} ${willFail ? "will-fail" : ""}">
                      <div class="fmz-gb-row-top">
                        <span>${willFail ? "⚠️" : isCritical ? "🚨" : "⚔️"} <b>${esc(a.attacker || "Inconnu")}</b></span>
                        <span class="fmz-gb-cd ${urgencyClass}" data-cd="${a.arrivalAt}">${formatDuration(leftSec)}</span>
                      </div>
                      <div class="fmz-gb-sub">🕒 ${arrivalTxt} · ${sentAnts > 0 ? `🐜 ${formatNumber(sentAnts)}` : "🐜 effectif ?"}</div>
                      ${badges.length ? `<div class="fmz-gb-tdc-line">${badges.join("")}</div>` : ""}
                      ${willFail ? `<div class="fmz-gb-fail">⚠️ ${esc(defTdc.failReason)}</div>` : ""}
                    </div>
                  `;
                })
                .join(""),
          `danger ${attacks.some((a) => (Number(a.arrivalAt || 0) - now) <= 30 * 60 * 1000) ? "urgent" : ""}`,
          !!collapsedMap.pl_attacks
        )}
        ${renderSectionBlock(
          "pl_hunts",
          "🏹 Chasses en cours",
          hunts.length,
          !hunts.length
            ? `<div class="fmz-gb-empty">Aucune chasse en cours.</div>`
            : hunts
                .slice()
                .sort((x, y) => Number(x.arrivalAt || 0) - Number(y.arrivalAt || 0))
                .map((h) => {
                  const leftSec = Math.max(0, Math.ceil((Number(h.arrivalAt || 0) - now) / 1000));
                  const tdcInfo = getHuntTdcSummary(h);
                  return `
                    <div class="fmz-gb-row">
                      <div class="fmz-gb-row-top">
                        <span>🏹 <b>${esc(selected.name)}</b>${h.area ? ` · +${formatNumber(h.area)} cm²` : ""}</span>
                        <span class="fmz-gb-cd" data-cd="${h.arrivalAt}">${formatDuration(leftSec)}</span>
                      </div>
                      ${
                        tdcInfo.hasTdc
                          ? `<div class="fmz-gb-tdc-line">${formatTdcChangeBadge("TDC", tdcInfo.beforeTdc, tdcInfo.afterTdc, tdcInfo.gainedTdc)}</div>`
                          : `<div class="fmz-gb-sub">TDC inconnu</div>`
                      }
                    </div>
                  `;
                })
                .join(""),
          "hunt",
          !!collapsedMap.pl_hunts
        )}
        ${renderSectionBlock(
          "pl_convoy_in",
          "📥 Convois entrants",
          playerConvoys.incoming.length,
          !playerConvoys.incoming.length
            ? `<div class="fmz-gb-empty">Aucun convoi entrant.</div>`
            : playerConvoys.incoming
                .map((c) => {
                  const leftSec = Math.max(0, Math.ceil((c.arrivalAt - now) / 1000));
                  return `<div class="fmz-gb-row"><div class="fmz-gb-row-top"><span>De <b>${esc(c.fromName)}</b> · 🪵 ${formatNumber(c.wood)} · 🍎 ${formatNumber(c.apples)}</span><span class="fmz-gb-cd" data-cd="${c.arrivalAt}">${formatDuration(leftSec)}</span></div></div>`;
                })
                .join(""),
          "in",
          !!collapsedMap.pl_convoy_in
        )}
        ${renderSectionBlock(
          "pl_convoy_out",
          "📤 Convois sortants",
          playerConvoys.outgoing.length,
          !playerConvoys.outgoing.length
            ? `<div class="fmz-gb-empty">Aucun convoi sortant.</div>`
            : playerConvoys.outgoing
                .map((c) => {
                  const leftSec = Math.max(0, Math.ceil((c.arrivalAt - now) / 1000));
                  return `<div class="fmz-gb-row"><div class="fmz-gb-row-top"><span>Vers <b>${esc(c.toName)}</b> · 🪵 ${formatNumber(c.wood)} · 🍎 ${formatNumber(c.apples)}</span><span class="fmz-gb-cd" data-cd="${c.arrivalAt}">${formatDuration(leftSec)}</span></div></div>`;
                })
                .join(""),
          "out",
          !!collapsedMap.pl_convoy_out
        )}
      `;

    const buildingsTabHtml = `
      <div class="fmz-gb-summary">
        🏗️ <b>Bâtiments de ${esc(selected.name)}</b> · Import automatique depuis <a class="fmz-gb-link" href="/construction.php">construction.php</a>.
      </div>
      ${renderLevelGridHtml(
        profile.buildings,
        "Aucun bâtiment importé pour ce joueur",
        "/construction.php"
      )}
    `;

    const labTabHtml = `
      <div class="fmz-gb-summary">
        🔬 <b>Laboratoire de ${esc(selected.name)}</b> · Import automatique depuis <a class="fmz-gb-link" href="/laboratoire.php">laboratoire.php</a> · VA : <b>${vaVal != null ? `niv. ${esc(vaVal)}` : "?"}</b>.
      </div>
      ${renderLevelGridHtml(
        profile.lab,
        "Aucune recherche importée pour ce joueur",
        "/laboratoire.php"
      )}
    `;

    const activeTabContent =
      selectedPlayerTab === "buildings"
        ? buildingsTabHtml
        : (selectedPlayerTab === "lab" ? labTabHtml : overviewTabHtml);

    return `
      <div id="fmz-gb-card" class="fmz-player-page">
        <div class="fmz-gb-head">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <b>👤 Page joueur · ${esc(selected.name)}${isMe ? " (moi)" : ""}</b>
            ${attackStatusBadge}
          </div>
          <div class="fmz-gb-head-actions">
            <button id="fmz-gb-pl-back" class="fmz-gb-btn" type="button">← Retour</button>
            <button id="fmz-gb-refresh" class="fmz-gb-btn" type="button" title="Rafraîchir maintenant">🔄</button>
            <button id="fmz-gb-pl-close" class="fmz-gb-btn" type="button" title="Fermer">✕</button>
          </div>
        </div>

        <div class="fmz-gb-status-bar">
          ${renderSyncStatusHtml()}
          <span>TDC : <b>${currentTdc ? `${formatNumber(currentTdc)} cm²` : "?"}</b> · VA : <b>${vaVal != null ? `niv. ${esc(vaVal)}` : "?"}</b></span>
        </div>

        <div class="fmz-gb-tabs">
          <button class="fmz-gb-tab ${selectedPlayerTab === "overview" ? "active" : ""}" data-pl-tab="overview" type="button">📊 Aperçu</button>
          <button class="fmz-gb-tab ${selectedPlayerTab === "buildings" ? "active" : ""}" data-pl-tab="buildings" type="button">🏗️ Bâtiments (${Object.keys(profile.buildings || {}).length})</button>
          <button class="fmz-gb-tab ${selectedPlayerTab === "lab" ? "active" : ""}" data-pl-tab="lab" type="button">🔬 Laboratoire (${Object.keys(profile.lab || {}).length})</button>
        </div>

        ${activeTabContent}
      </div>
    `;
    }

    return "";
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

    const leftDockSig = [
      updateBtnClass,
      updateBtnLabel,
      updateBtnTitle,
      isStatsOpen ? 1 : 0
    ].join("##");

    const sim = getTdcChains();
    const simSig = Array.from(sim.attacks.entries())
      .map(([k, v]) => `${k}:${v.willFail ? 1 : 0}:${v.taken || 0}:${v.ratioPct || 0}`)
      .join(",") + "|" + Array.from(sim.hunts.entries())
      .map(([k, v]) => `${k}:${v.before || 0}->${v.after || 0}`)
      .join(",");

    const profilesSig = JSON.stringify(readPlayerProfilesMap());

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
      selectedPlayerTab,
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
      simSig,
      profilesSig
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
                ? `<div class="fmz-gb-tdc-line">${formatTdcChangeBadge("TDC", tdcInfo.beforeTdc, tdcInfo.afterTdc, tdcInfo.gainedTdc)}</div>`
                : `<div class="fmz-gb-tdc">TDC actuel / après : <a class="fmz-gb-link" href="${esc(SHORTCUT_LINKS.membersUrl)}">Lire page Membres</a></div>`;
              return `
                <div class="fmz-gb-row">
                  <div class="fmz-gb-row-top">
                    <span><b>${esc(h.player || "Joueur")}</b>${areaLabel}</span>
                    <span class="fmz-gb-cd" data-cd="${h.arrivalAt}">${formatDuration(leftSec)}</span>
                  </div>
                  ${tdcSub}
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
              const badges = [];
              if (tdcInfo.hasTdc) {
                const defAfter = !willFail && tdcInfo.taken > 0 ? tdcInfo.afterTdc : tdcInfo.beforeTdc;
                const defDelta = !willFail && tdcInfo.taken > 0 ? -tdcInfo.taken : 0;
                badges.push(formatTdcChangeBadge("Moi", tdcInfo.beforeTdc, defAfter, defDelta));
              }
              if (atkTdc.hasTdc) {
                const atkAfter = !willFail && atkTdc.taken > 0 ? atkTdc.afterTdc : atkTdc.beforeTdc;
                const atkDelta = !willFail && atkTdc.taken > 0 ? atkTdc.taken : 0;
                badges.push(formatTdcChangeBadge(a.attacker || "Attaquant", atkTdc.beforeTdc, atkAfter, atkDelta));
              }
              const antsPart = sentAnts > 0
                ? `🐜 ${formatNumber(sentAnts)}`
                : `🐜 effectif inconnu`;
              const tdcSub = badges.length
                ? `<div class="fmz-gb-tdc-line">${badges.join("")}</div><div class="fmz-gb-sub">${antsPart}</div>`
                : `<div class="fmz-gb-tdc">TDC : <a class="fmz-gb-link" href="${esc(SHORTCUT_LINKS.membersUrl)}">Lire page Membres</a> · ${antsPart}</div>`;
              const ruleLine = willFail
                ? `<div class="fmz-gb-fail">⚠️ Hors plage 50%–300% (0 cm² pris) : ${esc(tdcInfo.failReason)}</div>`
                : (tdcInfo.hasTdc ? `<div class="fmz-gb-rule">🎯 Prise max : <b>${formatNumber(tdcInfo.taken)} cm²</b> (20% cible / effectif)</div>` : "");
              return `
                <div class="fmz-gb-row ${isWarn ? "soon" : ""} targeted-me ${willFail ? "will-fail" : ""}">
                  <div class="fmz-gb-row-top">
                    <b>${willFail ? "⚠️" : isCritical ? "🚨" : "🐎"} ${esc(a.attacker || "Inconnu")}</b>
                    <span class="fmz-gb-cd ${urgencyClass}" data-cd="${a.arrivalAt}">${formatDuration(leftSec)}</span>
                  </div>
                  ${tdcSub}
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
            ${renderSyncStatusHtml()}
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
        <button id="fmz-gb-players-fab" class="fmz-gb-fab players ${isPlayersOpen ? "active" : ""}" type="button" title="Pages joueurs">
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
        selectedPlayerKey = "";
        selectedPlayerTab = "overview";
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
        selectedPlayerTab = "overview";
        renderGlobalBubble(true);
      };
    });

    root.querySelectorAll("[data-pl-tab]").forEach((btn) => {
      btn.onclick = () => {
        selectedPlayerTab = btn.getAttribute("data-pl-tab") || "overview";
        renderGlobalBubble(true);
      };
    });

    const saveVaBtn = root.querySelector("#fmz-pl-va-save");
    const vaInp = root.querySelector("#fmz-pl-va-input");
    if (saveVaBtn && vaInp) {
      saveVaBtn.onclick = () => {
        const raw = String(vaInp.value || "").trim();
        const num = raw === "" ? null : Math.max(0, parseInt(raw, 10) || 0);
        updatePlayerProfile(devUser, { attackSpeed: num }, true);
        renderGlobalBubble(true);
      };
    }

    const plBackBtn = root.querySelector("#fmz-gb-pl-back");
    if (plBackBtn) {
      plBackBtn.onclick = () => {
        selectedPlayerKey = "";
        selectedPlayerTab = "overview";
        renderGlobalBubble(true);
      };
    }

    const closePlayersListBtn = root.querySelector("#fmz-gb-pl-list-close");
    if (closePlayersListBtn) {
      closePlayersListBtn.onclick = () => {
        selectedPlayerKey = "";
        selectedPlayerTab = "overview";
        setPlayersBubbleOpen(false);
        renderGlobalBubble(true);
      };
    }

    const closePlayersBtn = root.querySelector("#fmz-gb-pl-close");
    if (closePlayersBtn) {
      closePlayersBtn.onclick = () => {
        selectedPlayerKey = "";
        selectedPlayerTab = "overview";
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
        runPageCycle(true);
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
        runPageCycle(true);
        pullFromWorker(true).then((changed) => {
          if (changed) runPageCycle(true);
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
        runPageCycle(true);
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
        runPageCycle(true);
      }
    });
    obs.observe(document.body, { childList: true, subtree: false });
  }

  function runPageCycle(forceScrape = false) {
    if (!ensureContainersAttached()) return;
    observeBodyMutations();
    removeLegacyRessourcesPanel();
    if (isMembersPageView()) {
      scrapeAllianceMembersTdc(forceScrape);
    }
    if (IS_CONSTRUCTION) {
      scrapeConstructionPage(forceScrape);
    } else if (IS_LABORATOIRE) {
      scrapeLaboratoirePage(forceScrape);
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
  runPageCycle(true);
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
        active.id === "fmz-pl-va-input" ||
        (active.closest && active.closest("#fmz-gb-root")))
    ) {
      return;
    }
    runPageCycle();
  }, 5000);

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
    setTimeout(() => runPageCycle(true), 150);
    setTimeout(() => runPageCycle(true), 600);
  }, true);

  window.addEventListener("pageshow", () => {
    lastLeftDockSig = "";
    lastRootSig = "";
    lastMembersTableSig = "";
    lastConstructionSig = "";
    lastLaboSig = "";
    runPageCycle(true);
  });

  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEYS.convoyRequests) {
      convoyRequests = readJsonArray(STORAGE_KEYS.convoyRequests);
    }
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
      e.key === STORAGE_KEYS.allianceStats ||
      e.key === STORAGE_KEYS.playerProfiles
    ) {
      runPageCycle();
    }
  });
})();
