// ==UserScript==
// @name         Le Dôme De La Paix - Fourmizzz S5 (Ressources, Armee & Commerce)
// @namespace    https://s5.fourmizzz.fr/
// @version      0.5.22-worker
// @updateURL    https://raw.githubusercontent.com/LDDLP/applizze-script/main/fourmizzz.user.js
// @downloadURL  https://raw.githubusercontent.com/LDDLP/applizze-script/main/fourmizzz.user.js
// @description  Outils d'alliance centralisés : chasses & attaques entrantes (Ressources), détection d'attaques (Armee & ennemie), convois (Commerce) et bulles flottantes globales avec relai Worker.
// @match        *://*.fourmizzz.fr/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      applizze-worker.devreuxbenoit571.workers.dev
// ==/UserScript==

(function () {
  "use strict";

  const PATH = window.location.pathname.toLowerCase();
  const IS_RESSOURCES = PATH.includes("ressources.php");
  const IS_ARMEE = PATH.includes("armee.php");
  const IS_ENNEMIE = PATH.includes("ennemie.php");
  const IS_ATTACK_PAGE = IS_ARMEE || IS_ENNEMIE;
  const IS_COMMERCE = PATH.includes("commerce.php");

  const STORAGE_KEYS = {
    hunts: "fmz_local_hunts_v1",
    huntHistory: "fmz_local_hunt_history_v1",
    huntBenchmarks: "fmz_local_hunt_benchmarks_v1",
    attacks: "fmz_local_attacks_v1",
    movements: "fmz_local_movements_v1",
    convoyRequests: "fmz_local_convoy_requests_v1",
    convoyLog: "fmz_local_convoy_log_v1",
    pendingCommerceFill: "fmz_pending_commerce_fill_v1",
    devUser: "fmz_local_dev_user_v1",
    authToken: "fmz_local_auth_token_v1",
    workerPass: "fmz_local_worker_pass_v1",
    bubbleOpen: "fmz_global_bubble_open_v1",
    convoyBubbleOpen: "fmz_convoy_bubble_open_v1",
    bubbleSections: "fmz_global_bubble_sections_v1"
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

  const DEFAULT_PLAYERS = [
    { name: "Peps", x: 80, y: 52, va: 0 },
    { name: "Blue", x: 27, y: 41, va: 0 },
    { name: "Legrotteuh", x: 30, y: 43, va: 0 },
    { name: "Silas88", x: 2, y: 47, va: 0 },
    { name: "Grenouille", x: 95, y: 40, va: 0 },
    { name: "Hydci", x: 37, y: 41, va: 0 },
    { name: "Scrimey", x: 0, y: 54, va: 0 },
    { name: "Roiscorpion", x: 93, y: 39, va: 0 },
    { name: "Mick", x: 2, y: 77, va: 0 },
    { name: "Belphégor", x: 48, y: 56, va: 0 },
    { name: "Eldindon", x: 98, y: 48, va: 0 },
    { name: "Disco", x: 17, y: 80, va: 0 },
    { name: "Halfou", x: 15, y: 79, va: 0 },
    { name: "Spartiate", x: 95, y: 45, va: 0 },
    { name: "DEADKAT", x: 35, y: 81, va: 0 },
    { name: "Lafoufe", x: 94, y: 67, va: 0 }
  ];

  function setSyncState(state, label) {
    syncStatus = { state, label, at: Date.now() };
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
    const clean = String(name || "").trim() || DEFAULT_DEV_USER;
    const changed = normalizePseudo(getDevUser()) !== normalizePseudo(clean);
    try {
      localStorage.setItem(STORAGE_KEYS.devUser, clean);
    } catch (e) {}
    if (changed) {
      setStoredToken("");
      setStoredPassword("");
      Object.keys(lastSentSig).forEach((k) => delete lastSentSig[k]);
      lastSyncUpdatedAt = 0;
      nextRetryAt = 0;
    }
    return clean;
  }

  function resetAccountSession(newPseudo = "") {
    setStoredToken("");
    setStoredPassword("");
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
      if (typeof GM_getValue === "function") {
        return String(GM_getValue(STORAGE_KEYS.workerPass, "") || "");
      }
    } catch (e) {}
    try {
      return localStorage.getItem(STORAGE_KEYS.workerPass) || "";
    } catch (e) {
      return "";
    }
  }

  function setStoredPassword(pw) {
    const clean = String(pw || "");
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(STORAGE_KEYS.workerPass, clean);
        return;
      }
    } catch (e) {}
    try {
      if (clean) localStorage.setItem(STORAGE_KEYS.workerPass, clean);
      else localStorage.removeItem(STORAGE_KEYS.workerPass);
    } catch (e) {}
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
    const n = Number(cleaned);
    return Number.isSafeInteger(n) ? n : null;
  }

  function parseRemainingSeconds(text) {
    const match = String(text || "").match(
      /\bdans\s+(.+?)(?=\s+-\s*(?:Retour|Annuler)\b|\s+Arrivée\b|\s+Troupes\s+en\s+attaques?\b|$)/i
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
    const cleanLabel = String(arrivalLabel || "").trim().toLowerCase().replace(/\s+/g, " ");
    const timeKey = cleanLabel ? "lbl:" + cleanLabel : "bkt:" + Math.round(fallbackArrivalAt / 30000);
    return parts.concat(timeKey).join("#");
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
    const configPassword = String(authCfg.password || "");
    let password = configPassword || getStoredPassword();

    if (!password && hasStoredDevUser()) {
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
      return { ok: true, token: loginRes.data.token };
    }

    if (mode !== "admin" && authCfg.autoRegister && loginRes.status === 404 && pseudo) {
      const regRes = await httpJsonRequest("POST", `${baseUrl}/api/auth/register`, { pseudo, password });
      if (regRes.ok && regRes.data && regRes.data.token) {
        setStoredToken(regRes.data.token);
        return { ok: true, token: regRes.data.token };
      }
    }

    if (loginRes.status === 401 && !configPassword) setStoredPassword("");

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
    const localList = readJsonArray(STORAGE_KEYS.hunts).filter((h) => h && h.arrivalAt > now - 5000);
    const mineLocal = localList.filter((h) => normalizePseudo(h.player) === myNorm);

    const othersRemote = remoteHunts
      .filter((m) => normalizePseudo(m.from && m.from.name) !== myNorm && Number(m.arrivalAt) > now)
      .map((m) => ({
        id: String(m.id),
        sig: String(m.id),
        type: "hunt",
        player: (m.from && m.from.name) || "Joueur",
        area: Number(m.area) || 0,
        troops: Array.isArray(m.troops) ? m.troops : [],
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
    const localList = readJsonArray(STORAGE_KEYS.attacks).filter((a) => a && a.arrivalAt > now - 5000);
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

  function mergeRemoteConvoys(remoteConvoys) {
    const now = Date.now();
    const localList = readJsonArray(STORAGE_KEYS.movements).filter((m) => m && Number(m.arrivalAt) > now - 5000);
    const byId = new Map(localList.map((m) => [String(m.id), m]));

    for (const m of remoteConvoys) {
      if (!m || m.id === undefined || Number(m.arrivalAt) <= now) continue;
      byId.set(String(m.id), m);
    }

    const merged = Array.from(byId.values());
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

    const sinceParam = !force && lastSyncUpdatedAt ? `?since=${encodeURIComponent(lastSyncUpdatedAt)}` : "";
    let res = await httpJsonRequest("GET", `${baseUrl}/api/sync${sinceParam}`, undefined, token);

    if (!res.ok && res.status === 401) {
      setStoredToken("");
      token = await ensureWorkerToken(baseUrl, true);
      if (token) {
        res = await httpJsonRequest("GET", `${baseUrl}/api/sync${sinceParam}`, undefined, token);
      }
    }

    if (!res.ok) {
      nextRetryAt = Date.now() + RETRY_DELAY_MS;
      setSyncState("error", "Erreur synchro");
      return false;
    }

    setSyncState("ok", "Synchro OK");
    const data = res.data || {};
    if (data.unchanged) return false;

    if (typeof data.updatedAt === "number") {
      lastSyncUpdatedAt = data.updatedAt;
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

  function extractHuntsFromPage() {
    const now = Date.now();
    const playerName = getDevUser();
    const fullText = document.body ? document.body.innerText : "";
    const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    const blocks = [];
    let current = null;

    for (const line of lines) {
      if (/vos\s+chasseuses?\s+vont\s+conqu[eé]rir\b/i.test(line)) {
        if (current) blocks.push(current);
        current = [line];
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
      const area = areaMatch ? parseFrInt(areaMatch[1]) : null;
      const troopLine = blk.find((l) => /troupes\s+en\s+chasses?\s*:/i.test(l)) || "";
      const troops = parseTroopsList(troopLine);
      const arrivalMatch = blk.join(" ").match(/arriv[ée]e?\s+((?:demain\s+)?à\s+\d{1,2}h\d{2})/i);
      const arrivalLabel = arrivalMatch ? arrivalMatch[1] : "";

      const arrivalAt = now + remSec * 1000;
      const sig = buildStableSig(
        [
          normalizePseudo(playerName),
          area || 0,
          troops.map((t) => `${t.quantity}:${t.name.toLowerCase()}`).join("|")
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
        troops,
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

    let stored = readJsonArray(STORAGE_KEYS.hunts).filter((h) => h && h.arrivalAt > now - 5000);

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
          troops: item.troops.length ? item.troops : prev.troops,
          arrivalLabel: item.arrivalLabel || prev.arrivalLabel,
          firstSeenAt: Number(prev.firstSeenAt || prev.detectedAt || item.firstSeenAt || now),
          arrivalAt: diff < 30000 ? prev.arrivalAt : item.arrivalAt,
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
    const myHunts = nextHunts.filter((h) => normalizePseudo(h.player) === normPlayer);
    syncWithWorker({ kind: "hunts", player: playerName, hunts: myHunts });
    return nextHunts;
  }

  function getIncomingAttacksForCurrentUser() {
    const now = Date.now();
    const meNorm = normalizePseudo(getDevUser());
    if (!meNorm) return [];

    return readJsonArray(STORAGE_KEYS.attacks)
      .filter((a) => a && a.arrivalAt > now && normalizePseudo(a.target) === meNorm)
      .sort((a, b) => Number(a.arrivalAt || 0) - Number(b.arrivalAt || 0));
  }

  function getAllActiveHunts(now = Date.now()) {
    return readJsonArray(STORAGE_KEYS.hunts)
      .filter((h) => h && Number(h.arrivalAt || 0) > now)
      .sort((a, b) => Number(a.arrivalAt || 0) - Number(b.arrivalAt || 0));
  }

  let convoyRequests = readJsonArray(STORAGE_KEYS.convoyRequests);
  convoyRequests.forEach((r) => {
    if (!Array.isArray(r.deliveries)) r.deliveries = [];
  });
  let convoyLog = readJsonArray(STORAGE_KEYS.convoyLog);
  let convoyFilter = "open";
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

    const activeMovements = readJsonArray(STORAGE_KEYS.movements).filter(
      (m) => m && m.type === "convoy" && Number(m.arrivalAt || 0) > now
    );

    const byId = new Map();
    for (const m of activeMovements) {
      const id = String(m.id || `${m.arrivalAt}_${m.wood}_${m.apples}`);
      byId.set(id, {
        id,
        fromName: (m.from && m.from.name) || m.createdBy || "Joueur",
        toName: (m.to && m.to.name) || "Destinataire",
        wood: Number(m.wood) || 0,
        apples: Number(m.apples) || 0,
        arrivalAt: Number(m.arrivalAt)
      });
    }

    for (const r of convoyRequests) {
      if (!r || !Array.isArray(r.deliveries)) continue;
      for (const d of r.deliveries) {
        const arrAt = Number(d && d.arrivalAt || 0);
        if (!arrAt || arrAt <= now) continue;
        const id = d.movementId ? String(d.movementId) : `del_${r.id}_${arrAt}`;
        if (!byId.has(id)) {
          byId.set(id, {
            id,
            fromName: d.by || d.loggedBy || "Joueur",
            toName: r.player || "Destinataire",
            wood: Number(d.wood) || 0,
            apples: Number(d.apples) || 0,
            arrivalAt: arrAt
          });
        }
      }
    }

    const all = Array.from(byId.values()).sort((a, b) => a.arrivalAt - b.arrivalAt);
    return {
      incoming: all.filter((c) => normalizePseudo(c.toName) === meNorm),
      outgoing: all.filter((c) => normalizePseudo(c.fromName) === meNorm)
    };
  }

  let armeeBubbleTimer = null;
  let lastArmeeSnapshotKey = "";

  function ensureArmeeIndicator() {
    if (!IS_ATTACK_PAGE) return null;
    if (!document.getElementById("fmz-armee-style")) {
      const style = document.createElement("style");
      style.id = "fmz-armee-style";
      style.textContent = `
        #fmz-armee-badge-wrap{
          position:fixed;right:12px;bottom:14px;z-index:9998;
          display:flex;align-items:center;gap:8px;
          font-family:Arial,sans-serif;pointer-events:none;
        }
        #fmz-armee-icon{
          width:34px;height:34px;border-radius:999px;
          background:#1f2937;border:1px solid #4b5563;color:#e5e7eb;
          display:flex;align-items:center;justify-content:center;font-size:16px;
          box-shadow:0 4px 12px rgba(0,0,0,.45);
          pointer-events:auto;cursor:pointer;user-select:none;
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
      document.head.appendChild(style);
    }

    let wrap = document.getElementById("fmz-armee-badge-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "fmz-armee-badge-wrap";
      wrap.innerHTML = `
        <div id="fmz-armee-bubble" role="status" aria-live="polite">Attaques importées</div>
        <div id="fmz-armee-icon" title="Statut de synchronisation Armée">📡</div>
      `;
      document.body.appendChild(wrap);
      const icon = document.getElementById("fmz-armee-icon");
      if (icon) {
        icon.addEventListener("click", () => showArmeeImportedBubble("Attaques importées"));
      }
    }
    return wrap;
  }

  function showArmeeImportedBubble(message = "Attaques importées") {
    if (!IS_ATTACK_PAGE) return;
    ensureArmeeIndicator();
    const bubble = document.getElementById("fmz-armee-bubble");
    if (!bubble) return;
    bubble.textContent = message;
    bubble.classList.add("show");
    if (armeeBubbleTimer) clearTimeout(armeeBubbleTimer);
    armeeBubbleTimer = setTimeout(() => {
      bubble.classList.remove("show");
      armeeBubbleTimer = null;
    }, 3000);
  }

  function extractAttacksFromArmeePage() {
    const now = Date.now();
    const attackerName = getDevUser();
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
      const totalAnts = troops.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);

      const arrivalLine = blk.find((l) => /arriv[ée]e?\s+(?:demain\s+)?à\s+/i.test(l)) || "";
      const arrivalMatch = arrivalLine.match(/arriv[ée]e?\s+((?:demain\s+)?à\s+\d{1,2}h\d{2})/i);
      const arrivalLabel = arrivalMatch ? arrivalMatch[1] : "";

      const arrivalAt = now + remSec * 1000;
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

    let stored = readJsonArray(STORAGE_KEYS.attacks).filter((a) => a && a.arrivalAt > now - 5000);

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
          arrivalAt: diff < 30000 ? prev.arrivalAt : item.arrivalAt,
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

  function injectRessourcesStyles() {
    if (document.getElementById("fmz-script-style")) return;
    const style = document.createElement("style");
    style.id = "fmz-script-style";
    style.textContent = `
      #fmz-panel{
        margin:10px auto;max-width:920px;background:#1f2937;color:#f3f4f6;
        border:1px solid #4b5563;border-left:5px solid #3b82f6;border-radius:8px;
        padding:10px 12px;font-family:Arial,sans-serif;font-size:13px;
        box-shadow:0 4px 14px rgba(0,0,0,.35);
      }
      #fmz-panel.has-alert{border-left-color:#ef4444;border-color:#991b1b}
      .fmz-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
      .fmz-title{font-weight:bold;font-size:14px}
      .fmz-dev{display:flex;align-items:center;gap:6px;font-size:11px;color:#cbd5e1}
      .fmz-dev input{background:#111827;color:#fff;border:1px solid #6b7280;border-radius:4px;padding:3px 7px;font-size:12px;width:130px}
      .fmz-dev button{background:#166534;color:#fff;border:1px solid #22c55e;border-radius:4px;padding:3px 9px;font-size:12px;cursor:pointer;font-weight:bold}
      .fmz-item{background:#111827;border:1px solid #374151;border-left:4px solid #ef4444;border-radius:6px;padding:8px 10px;margin-top:6px;line-height:1.45}
      .fmz-item-top{display:flex;justify-content:space-between;gap:8px;font-weight:bold;color:#fca5a5}
      .fmz-muted{color:#9ca3af;font-size:12px}
      .fmz-foot{margin-top:8px;padding-top:6px;border-top:1px solid #374151;font-size:12px;color:#fde68a}
      .fmz-bench{margin-top:6px;padding:6px 8px;background:#111827;border:1px solid #374151;border-radius:6px;font-size:11px;color:#cbd5e1;line-height:1.4}
    `;
    document.head.appendChild(style);
  }

  function ensureRessourcesShell() {
    injectRessourcesStyles();
    let panel = document.getElementById("fmz-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "fmz-panel";
      const anchor =
        document.querySelector("#centre, .centre, main, #contenu, .contenu") ||
        document.body.firstElementChild;
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(panel, anchor);
      } else {
        document.body.prepend(panel);
      }
    }

    if (!panel.querySelector("#fmz-dev-input")) {
      panel.innerHTML = `
        <div class="fmz-head">
          <div class="fmz-title">🛡️ Attaques en cours sur moi</div>
          <div class="fmz-dev">
            <span>Dev joueur :</span>
            <input id="fmz-dev-input" type="text" autocomplete="off" title="Joueur actif en local">
            <button id="fmz-dev-save" type="button">OK</button>
          </div>
        </div>
        <div id="fmz-panel-body"></div>
        <div id="fmz-panel-foot" class="fmz-foot"></div>
        <div id="fmz-panel-bench" class="fmz-bench"></div>
      `;

      const saveBtn = panel.querySelector("#fmz-dev-save");
      const inputEl = panel.querySelector("#fmz-dev-input");
      const applyDevChange = () => {
        setDevUser(inputEl.value);
        runPageCycle();
        pullFromWorker(true).then((changed) => {
          if (changed) runPageCycle();
        });
      };
      saveBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyDevChange();
      });
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          applyDevChange();
        }
      });
    }
    return panel;
  }

  function renderRessourcesPanel(huntsList) {
    const panel = ensureRessourcesShell();
    const inputEl = panel.querySelector("#fmz-dev-input");
    const bodyEl = panel.querySelector("#fmz-panel-body");
    const footEl = panel.querySelector("#fmz-panel-foot");
    const benchEl = panel.querySelector("#fmz-panel-bench");
    const now = Date.now();
    const devUser = getDevUser();

    if (inputEl && document.activeElement !== inputEl && inputEl.value !== devUser) {
      inputEl.value = devUser;
    }

    const attacks = getIncomingAttacksForCurrentUser();
    const myHunts = (huntsList || readJsonArray(STORAGE_KEYS.hunts)).filter(
      (h) => h && h.arrivalAt > now && normalizePseudo(h.player) === normalizePseudo(devUser)
    );

    panel.classList.toggle("has-alert", attacks.length > 0);

    bodyEl.innerHTML = !attacks.length
      ? `<div class="fmz-muted">Aucune attaque en cours sur <b>${esc(devUser)}</b>.</div>`
      : attacks
          .map((a) => {
            const leftSec = Math.max(0, Math.ceil((a.arrivalAt - now) / 1000));
            const troopsText = Array.isArray(a.troops) && a.troops.length
              ? a.troops.map((t) => `${formatNumber(t.quantity)} ${esc(t.name)}`).join(", ")
              : a.ants ? `${formatNumber(a.ants)} fourmis` : "Troupes non détaillées";
            return `
              <div class="fmz-item">
                <div class="fmz-item-top">
                  <span>🐎 ${esc(a.attacker || "Inconnu")} → ${esc(a.target)}</span>
                  <span data-cd="${a.arrivalAt}">${formatDuration(leftSec)}</span>
                </div>
                <div class="fmz-muted">🐜 Troupes : ${troopsText}${a.ants ? ` (Total : ${formatNumber(a.ants)})` : ""}</div>
                <div class="fmz-muted">🕒 ${esc(a.arrivalLabel || new Date(a.arrivalAt).toLocaleTimeString("fr-FR"))}</div>
              </div>
            `;
          })
          .join("");

    footEl.innerHTML = myHunts.length
      ? `⚔️ Chasses suivies automatiquement : <b>${myHunts.length}</b> (${myHunts
          .map((h) => `${formatNumber(h.area)} cm² dans ${formatDuration(Math.ceil((h.arrivalAt - now) / 1000))}`)
          .join(" · ")})`
      : `⚔️ Chasses suivies automatiquement : <b>0</b>`;

    const benchmarks = readJsonArray(STORAGE_KEYS.huntBenchmarks).slice(0, 5);
    const history = readJsonArray(STORAGE_KEYS.huntHistory).slice(0, 3);
    const benchText = benchmarks.length
      ? benchmarks.map((b) => `<b>${formatNumber(b.area)} cm²</b> ≈ ${formatDuration(b.durationSec)}`).join(" · ")
      : "Aucun repère enregistré pour l'instant (se remplit automatiquement quand une chasse est détectée).";
    const histText = history.length
      ? `<div style="margin-top:4px;color:#86efac">✅ Dernières chasses bouclées : ${history
          .map((h) => `${esc(h.player || devUser)} (${formatNumber(h.area)} cm²)`)
          .join(" · ")}</div>`
      : "";
    benchEl.innerHTML = `⏱️ <b>Repères de durée de chasse :</b> ${benchText}${histText}`;
  }
  function findPlayerByPseudo(name) {
    const n = normalizePseudo(name);
    return DEFAULT_PLAYERS.find((p) => normalizePseudo(p.name) === n) || null;
  }

  function calcTravelSeconds(fromP, toP) {
    if (!fromP || !toP) return 60;
    const d = Math.hypot((fromP.x || 0) - (toP.x || 0), (fromP.y || 0) - (toP.y || 0));
    const sec = Math.round((1 - Math.exp(-d / 350)) * 7.375 * 86400 * Math.pow(0.9, fromP.va || 0));
    return sec > 0 ? sec : 60;
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
    return readJsonArray(STORAGE_KEYS.movements).filter(
      (m) => m && m.type === "convoy" && Number(m.arrivalAt || 0) > now
    );
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

  function fillCommerceFormFields({ recipient, apples, wood }) {
    if (!IS_COMMERCE) return { filledCount: 0, totalVisibleFields: 0 };

    const isVisibleField = (el) => {
      if (!el || (el.closest && el.closest("#fmz-gb-root"))) return false;
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

  function deliverConvoyRequest({ requestId, rawWood, rawApples, redirectToCommerce = false }) {
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

    const sender = findPlayerByPseudo(devUser) || { name: devUser, x: 0, y: 0, va: 0 };
    const dest = findPlayerByPseudo(r.player) || { name: r.player, x: 0, y: 0, va: 0 };
    const dur = calcTravelSeconds(sender, dest);
    const tNow = Date.now();
    const arrivalAt = tNow + dur * 1000;
    const mvs = readJsonArray(STORAGE_KEYS.movements);
    const mvId = tNow + "_" + Math.floor(Math.random() * 1e6);
    const mv = {
      id: mvId,
      type: "convoy",
      from: sender,
      to: dest,
      duration: dur,
      startAt: tNow,
      arrivalAt,
      wood,
      apples,
      requestId: r.id,
      createdBy: devUser
    };
    mvs.push(mv);
    writeJsonArray(STORAGE_KEYS.movements, mvs);
    convoyLog.push({
      from: sender.name,
      to: dest.name,
      wood,
      apples,
      requestId: r.id,
      arrivalAt
    });
    saveConvoyLog();

    const delivery = {
      by: sender.name,
      loggedBy: devUser,
      wood,
      apples,
      at: tNow,
      arrivalAt,
      movementId: mvId
    };
    r.deliveries.push(delivery);
    const leftAfter = reqRemaining(r);
    const isPartial = leftAfter.wood > 0 || leftAfter.apples > 0;
    if (!isPartial) {
      r.status = "done";
      r.doneAt = tNow;
    }
    delete convoyDrafts[r.id];
    saveConvoyRequestsLocal();
    syncWithWorker({ kind: "movements", action: "create", movement: mv }, false);
    syncWithWorker({ kind: "requests", action: "deliver", id: r.id, delivery }, false);

    if (IS_COMMERCE) {
      fillCommerceFormFields({ recipient: dest.name, apples, wood });
      return {
        ok: true,
        message: `✓ Convoi enregistré vers ${dest.name} · champs pré-remplis.`
      };
    }

    if (redirectToCommerce) {
      queuePendingCommerceFill({ recipient: dest.name, apples, wood });
      window.location.href = "/commerce.php";
      return { ok: true, redirected: true, message: "🚚 Redirection vers Commerce…" };
    }

    return {
      ok: true,
      message: `✓ Convoi enregistré vers ${dest.name}.`
    };
  }

  function injectGlobalBubbleStyles() {
    if (document.getElementById("fmz-global-bubble-style")) return;
    const style = document.createElement("style");
    style.id = "fmz-global-bubble-style";
    style.textContent = `
      #fmz-gb-root{
        position:fixed;right:12px;bottom:14px;z-index:10000;
        display:flex;flex-direction:column;align-items:flex-end;gap:8px;
        font-family:Arial,sans-serif;font-size:12px;color:#f3f4f6;
      }
      #fmz-gb-root.has-armee-badge{bottom:56px}
      #fmz-gb-root *{box-sizing:border-box}
      .fmz-gb-dock{display:flex;align-items:center;gap:6px}
      .fmz-gb-fab{
        display:flex;align-items:center;gap:6px;
        background:#1f2937;color:#f9fafb;border:1px solid #4b5563;
        border-radius:999px;padding:7px 12px;cursor:pointer;
        font-weight:bold;font-size:12px;box-shadow:0 6px 18px rgba(0,0,0,.5);
        user-select:none;
      }
      .fmz-gb-fab.alert{
        background:#7f1d1d;border-color:#ef4444;color:#fff;
      }
      .fmz-gb-fab.convoy.active{
        background:#1e3a8a;border-color:#60a5fa;color:#fff;
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
        max-height:calc(100vh - 110px);
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
      .fmz-gb-row{padding:5px 0;border-top:1px solid #1f2937;line-height:1.35}
      .fmz-gb-row.soon{background:rgba(239,68,68,.12);padding:5px 6px;border-radius:5px}
      .fmz-gb-row:first-of-type{border-top:none;padding-top:1px}
      .fmz-gb-row-top{display:flex;justify-content:space-between;align-items:center;gap:6px}
      .fmz-gb-cd{white-space:nowrap;font-weight:bold;font-size:11px;color:#93c5fd}
      .fmz-gb-cd.critical{color:#fca5a5;background:#7f1d1d;padding:1px 5px;border-radius:4px}
      .fmz-gb-cd.warn{color:#fde68a}
      .fmz-gb-sub{color:#9ca3af;font-size:11px;margin-top:2px}
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
    `;
    document.head.appendChild(style);
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
            const statusText = del.wood || del.apples
              ? `Partielle · reste 🪵 ${formatNumber(rem.wood)} · 🍎 ${formatNumber(rem.apples)}`
              : `Ouverte`;

            const actionBlock = ownReq
              ? `<div class="fmz-gb-sub" style="color:#fca5a5">Votre demande personnelle</div>`
              : `
                <div class="fmz-gb-grid2">
                  ${
                    rem.wood > 0
                      ? `<div><label class="fmz-gb-lbl">🪵 Bois (max ${formatNumber(rem.wood)})</label><input class="fmz-gb-inp" data-cv-df="wood" data-cv-did="${esc(r.id)}" data-cv-max="${rem.wood}" type="number" min="0" max="${rem.wood}" value="${esc(wVal)}"></div>`
                      : ""
                  }
                  ${
                    rem.apples > 0
                      ? `<div><label class="fmz-gb-lbl">🍎 Pommes (max ${formatNumber(rem.apples)})</label><input class="fmz-gb-inp" data-cv-df="apples" data-cv-did="${esc(r.id)}" data-cv-max="${rem.apples}" type="number" min="0" max="${rem.apples}" value="${esc(aVal)}"></div>`
                      : ""
                  }
                </div>
                <div class="fmz-gb-actions">
                  <button class="fmz-gb-btn accent" data-cv-act="max" data-cv-id="${esc(r.id)}" type="button">Max</button>
                  <button class="fmz-gb-btn primary" data-cv-act="send" data-cv-id="${esc(r.id)}" type="button">🚚 Lancer convoi</button>
                </div>
              `;

            return `
              <div class="fmz-gb-row" data-cv-card="${esc(r.id)}">
                <div class="fmz-gb-row-top">
                  <span><b>${esc(r.player)}</b> · 🪵 ${formatNumber(r.wood)} · 🍎 ${formatNumber(r.apples)}</span>
                  <span class="fmz-gb-cd">${esc(statusText)}</span>
                </div>
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
        if (act === "max") {
          const rem = reqRemaining(r);
          convoyDrafts[r.id] = { wood: rem.wood, apples: rem.apples };
          lastCommerceMessage = `✓ Max sélectionné pour ${r.player}.`;
          renderGlobalBubble();
        } else if (act === "send") {
          const card = btn.closest("[data-cv-card]");
          const wInp = card?.querySelector('[data-cv-df="wood"]');
          const aInp = card?.querySelector('[data-cv-df="apples"]');
          const res = deliverConvoyRequest({
            requestId: r.id,
            rawWood: wInp ? wInp.value : 0,
            rawApples: aInp ? aInp.value : 0,
            redirectToCommerce: true
          });
          lastCommerceMessage = res.message;
          if (!res.redirected) renderGlobalBubble();
        }
      };
    });
  }

  function renderGlobalBubble() {
    if (!document.body) return;
    injectGlobalBubbleStyles();

    let root = document.getElementById("fmz-gb-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "fmz-gb-root";
      document.body.appendChild(root);
    }
    root.classList.toggle("has-armee-badge", IS_ATTACK_PAGE);

    const now = Date.now();
    const devUser = getDevUser();
    const incomingAttacks = getIncomingAttacksForCurrentUser();
    const convoys = getConvoySummaryForUser(devUser, now);
    const allHunts = getAllActiveHunts(now);
    const openRequestsCount = convoyRequests.filter((r) => r.status !== "done").length;
    const isDomeOpen = isGlobalBubbleOpen();
    const isConvoyOpen = isConvoyBubbleOpen();
    const collapsedMap = getCollapsedSections();

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

    if (isConvoyOpen) {
      cardHtml = buildConvoyBubbleHtml(devUser, now, collapsedMap);
    } else if (isDomeOpen) {
      const attacksHtml = !incomingAttacks.length
        ? `<div class="fmz-gb-empty">Aucune attaque en cours sur moi.</div>`
        : incomingAttacks
            .map((a) => {
              const leftSec = Math.max(0, Math.ceil((Number(a.arrivalAt || 0) - now) / 1000));
              const isCritical = leftSec <= 15 * 60;
              const isWarn = leftSec <= 30 * 60;
              const urgencyClass = isCritical ? "critical" : isWarn ? "warn" : "";
              const troopsText = Array.isArray(a.troops) && a.troops.length
                ? a.troops.map((t) => `${formatNumber(t.quantity)} ${esc(t.name)}`).join(", ")
                : a.ants ? `${formatNumber(a.ants)} fourmis` : "Troupes non détaillées";
              return `
                <div class="fmz-gb-row ${isWarn ? "soon" : ""}">
                  <div class="fmz-gb-row-top">
                    <b>${isCritical ? "🚨" : "🐎"} ${esc(a.attacker || "Inconnu")}</b>
                    <span class="fmz-gb-cd ${urgencyClass}" data-cd="${a.arrivalAt}">${formatDuration(leftSec)}</span>
                  </div>
                  <div class="fmz-gb-sub">${troopsText}</div>
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

      const huntsHtml = !allHunts.length
        ? `<div class="fmz-gb-empty">Aucune chasse en cours dans l'alliance.</div>`
        : allHunts
            .map((h) => {
              const leftSec = Math.max(0, Math.ceil((h.arrivalAt - now) / 1000));
              const areaLabel = h.area ? ` · ${formatNumber(h.area)} cm²` : "";
              return `
                <div class="fmz-gb-row">
                  <div class="fmz-gb-row-top">
                    <span><b>${esc(h.player || "Joueur")}</b>${areaLabel}</span>
                    <span class="fmz-gb-cd" data-cd="${h.arrivalAt}">${formatDuration(leftSec)}</span>
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

      const accountHtml = accountDrawerOpen
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

      const commerceShortcut = !IS_COMMERCE && openRequestsCount > 0
        ? `<a class="fmz-gb-link" href="/commerce.php">🚚 Aller Commerce</a>`
        : `<span>${esc(syncStatus.label)}</span>`;

      cardHtml = `
        <div id="fmz-gb-card">
          <div class="fmz-gb-head">
            <b>🐜 Dôme · ${esc(devUser)}</b>
            <div class="fmz-gb-head-actions">
              <button id="fmz-gb-refresh" class="fmz-gb-btn" type="button" title="Rafraîchir maintenant">🔄</button>
              <button id="fmz-gb-acc" class="fmz-gb-btn" type="button" title="Compte & session">⚙️</button>
              <button id="fmz-gb-close" class="fmz-gb-btn" type="button" title="Réduire">_</button>
            </div>
          </div>

          <div class="fmz-gb-status-bar">
            <span>${esc(syncStatus.label)}</span>
            ${commerceShortcut}
          </div>

          ${accountHtml}

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
            "hunts",
            "⚔️ Chasses en cours (tous)",
            allHunts.length,
            huntsHtml,
            "hunt",
            !!collapsedMap.hunts
          )}

          ${renderSectionBlock(
            "convoy_out",
            "📤 Convois que j'ai lancés",
            convoys.outgoing.length,
            outgoingConvoysHtml,
            "out",
            !!collapsedMap.convoy_out
          )}
        </div>
      `;
    }

    root.innerHTML = `
      ${cardHtml}
      <div class="fmz-gb-dock">
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

    root.querySelector("#fmz-gb-fab").onclick = () => {
      const next = !isGlobalBubbleOpen();
      setGlobalBubbleOpen(next);
      if (next) setConvoyBubbleOpen(false);
      renderGlobalBubble();
    };

    root.querySelector("#fmz-gb-convoy-fab").onclick = () => {
      const next = !isConvoyBubbleOpen();
      setConvoyBubbleOpen(next);
      if (next) setGlobalBubbleOpen(false);
      renderGlobalBubble();
    };

    const closeDomeBtn = root.querySelector("#fmz-gb-close");
    if (closeDomeBtn) {
      closeDomeBtn.onclick = () => {
        setGlobalBubbleOpen(false);
        renderGlobalBubble();
      };
    }

    const closeConvoyBtn = root.querySelector("#fmz-gb-cv-close");
    if (closeConvoyBtn) {
      closeConvoyBtn.onclick = () => {
        setConvoyBubbleOpen(false);
        renderGlobalBubble();
      };
    }

    const refreshBtn = root.querySelector("#fmz-gb-refresh");
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        setSyncState("syncing", "Synchro…");
        renderGlobalBubble();
        await pullFromWorker(true);
        runPageCycle();
      };
    }

    const accBtn = root.querySelector("#fmz-gb-acc");
    if (accBtn) {
      accBtn.onclick = () => {
        accountDrawerOpen = !accountDrawerOpen;
        renderGlobalBubble();
      };
    }

    const savePseudoBtn = root.querySelector("#fmz-gb-pseudo-save");
    const pseudoInp = root.querySelector("#fmz-gb-pseudo-input");
    const logoutBtn = root.querySelector("#fmz-gb-logout-btn");

    if (savePseudoBtn && pseudoInp) {
      const submitPseudo = () => {
        setDevUser(pseudoInp.value);
        accountDrawerOpen = false;
        runPageCycle();
        pullFromWorker(true).then((changed) => {
          if (changed) runPageCycle();
          else renderGlobalBubble();
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
          renderGlobalBubble();
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

  function runPageCycle() {
    if (IS_RESSOURCES) {
      const hunts = reconcileHunts();
      renderRessourcesPanel(hunts);
    } else if (IS_ATTACK_PAGE) {
      ensureArmeeIndicator();
      reconcileArmeeAttacks();
    } else if (IS_COMMERCE) {
      consumePendingCommerceFillIfNeeded();
    }
    renderGlobalBubble();
  }

  runPageCycle();
  consumePendingCommerceFillIfNeeded();
  pullFromWorker(true).then((changed) => {
    if (changed) runPageCycle();
    else renderGlobalBubble();
  });

  setInterval(tickCountdowns, 1000);

  setInterval(() => {
    const active = document.activeElement;
    if (
      active &&
      (active.id === "fmz-dev-input" ||
        active.id === "fmz-gb-pseudo-input" ||
        (active.closest && active.closest("#fmz-gb-root")))
    ) {
      return;
    }
    runPageCycle();
  }, 5000);

  setInterval(() => {
    const active = document.activeElement;
    if (active && active.closest && active.closest("#fmz-gb-root")) return;
    if (active && active.id === "fmz-dev-input") return;
    pullFromWorker(false).then((changed) => {
      if (changed) runPageCycle();
      else renderGlobalBubble();
    });
  }, 15000);

  window.addEventListener("storage", (e) => {
    if (
      e.key === STORAGE_KEYS.attacks ||
      e.key === STORAGE_KEYS.hunts ||
      e.key === STORAGE_KEYS.movements ||
      e.key === STORAGE_KEYS.devUser ||
      e.key === STORAGE_KEYS.convoyRequests ||
      e.key === STORAGE_KEYS.bubbleOpen ||
      e.key === STORAGE_KEYS.convoyBubbleOpen ||
      e.key === STORAGE_KEYS.bubbleSections
    ) {
      runPageCycle();
    }
  });
})();
