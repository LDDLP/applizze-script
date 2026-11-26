// ==UserScript==
// @name         Le Dôme De La Paix - Fourmizzz S5 (Ressources, Armee & Commerce)
// @namespace    https://s5.fourmizzz.fr/
// @version      0.5.12-worker
// @updateURL    https://raw.githubusercontent.com/LDDLP/applizze-script/main/fourmizzz.user.js
// @downloadURL  https://raw.githubusercontent.com/LDDLP/applizze-script/main/fourmizzz.user.js
// @description  Outils d'alliance centralisés : chasses & attaques entrantes (Ressources), détection d'attaques (Armee), et convois (Commerce) avec relai Worker.
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
  const IS_COMMERCE = PATH.includes("commerce.php");

  if (!IS_RESSOURCES && !IS_ARMEE && !IS_COMMERCE) return;

  const STORAGE_KEYS = {
    hunts: "fmz_local_hunts_v1",
    attacks: "fmz_local_attacks_v1",
    movements: "fmz_local_movements_v1",
    convoyRequests: "fmz_local_convoy_requests_v1",
    convoyLog: "fmz_local_convoy_log_v1",
    devUser: "fmz_local_dev_user_v1",
    authToken: "fmz_local_auth_token_v1",
    workerPass: "fmz_local_worker_pass_v1"
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

  function normalizePseudo(raw) {
    return String(raw || "")
      .replace(/\([^)]*\)/g, "")
      .trim()
      .toLowerCase();
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
      return { ok: true, mode: "local-only" };
    }

    const baseUrl = String(WORKER_CONFIG.endpoint || "").replace(/\/+$/, "");
    if (!baseUrl) {
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
      return { ok: false, mode: "backoff", error: "Nouvel essai différé" };
    }

    let token = await ensureWorkerToken(baseUrl, false);
    if (!token) {
      nextRetryAt = Date.now() + RETRY_DELAY_MS;
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
    } else {
      nextRetryAt = Date.now() + RETRY_DELAY_MS;
    }

    return res;
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
        detectedAt: Number(m.startAt) || now,
        arrivalAt: Number(m.arrivalAt),
        active: true
      }));

    const merged = mineLocal.concat(othersRemote);
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
    if (!WORKER_CONFIG.enabled) return false;
    const baseUrl = String(WORKER_CONFIG.endpoint || "").replace(/\/+$/, "");
    if (!baseUrl || Date.now() < nextRetryAt) return false;

    let token = await ensureWorkerToken(baseUrl, false);
    if (!token) return false;

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
      return false;
    }

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
        bySig.set(item.sig, {
          ...prev,
          area: item.area ?? prev.area,
          troops: item.troops.length ? item.troops : prev.troops,
          arrivalLabel: item.arrivalLabel || prev.arrivalLabel,
          arrivalAt: diff < 30000 ? prev.arrivalAt : item.arrivalAt,
          active: true
        });
      } else {
        bySig.set(item.sig, item);
      }
    }

    const nextHunts = Array.from(bySig.values());
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
      .sort((a, b) => a.arrivalAt - b.arrivalAt);
  }

  let armeeBubbleTimer = null;
  let lastArmeeSnapshotKey = "";

  function ensureArmeeIndicator() {
    if (!IS_ARMEE) return null;
    if (!document.getElementById("fmz-armee-style")) {
      const style = document.createElement("style");
      style.id = "fmz-armee-style";
      style.textContent = `
        #fmz-armee-badge-wrap{
          position:fixed;right:12px;bottom:14px;z-index:9999;
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
    if (!IS_ARMEE) return;
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
  }

  let convoyRequests = readJsonArray(STORAGE_KEYS.convoyRequests);
  convoyRequests.forEach((r) => {
    if (!Array.isArray(r.deliveries)) r.deliveries = [];
  });
  let convoyLog = readJsonArray(STORAGE_KEYS.convoyLog);
  let convoyTab = "requests";
  let convoyFilter = "open";
  const convoyDrafts = {};
  let lastCommerceMessage = "";

  function saveConvoyRequestsLocal() {
    writeJsonArray(STORAGE_KEYS.convoyRequests, convoyRequests);
  }

  function saveConvoyLog() {
    writeJsonArray(STORAGE_KEYS.convoyLog, convoyLog);
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

  function hasActiveDelivery(r, now = Date.now()) {
    return (r.deliveries || []).some(
      (d) => Number(d.arrivalAt || 0) > now || Number(d.wood || 0) > 0 || Number(d.apples || 0) > 0
    );
  }

  function clampNonNegativeInt(raw) {
    const n = Math.floor(Number(raw || 0));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function fillCommerceFormFields({ recipient, apples, wood }) {
    if (!IS_COMMERCE) return;

    const isVisibleField = (el) => {
      if (!el || (el.closest && el.closest("#ddp-overlay"))) return false;
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

  function injectCommerceStyles() {
    if (document.getElementById("ddp-commerce-style")) return;
    const style = document.createElement("style");
    style.id = "ddp-commerce-style";
    style.textContent = `
      #ddp-overlay{display:block;position:relative;clear:both;width:calc(100% - 16px);max-width:680px;margin:18px auto 34px;background:#1f2937;color:#e5e7eb;border:1px solid #4b5563;border-radius:12px;padding:12px;z-index:50;font:13px/1.45 Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5)}
      #ddp-overlay.ddp-minimized{width:auto;display:inline-block}
      #ddp-overlay *{box-sizing:border-box}
      .ddp-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
      .ddp-head b{font-size:14px;color:#fff}
      .ddp-btn-mini{background:#374151;color:#fff;border:1px solid #6b7280;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px}
      .ddp-tabs,.ddp-filters{display:grid;gap:6px;margin-bottom:10px}
      .ddp-tabs{grid-template-columns:1fr 1fr}
      .ddp-filters{grid-template-columns:repeat(3,1fr)}
      .ddp-tab,.ddp-filter,.ddp-btn{padding:7px 6px;border-radius:7px;border:1px solid #4b5563;background:#111827;color:#e5e7eb;cursor:pointer;font-weight:bold;font-size:12px;text-align:center}
      .ddp-tab.active,.ddp-filter.active{background:#374151;border-color:#9ca3af;color:#fff}
      .ddp-btn.primary{background:#166534;border-color:#15803d;width:100%;margin-top:8px}
      .ddp-btn.max-btn{background:#1e3a8a;border-color:#3b82f6;color:#fff;flex:0 0 auto;min-width:72px}
      .ddp-btn.danger{background:#7f1d1d;border-color:#991b1b}
      .ddp-input,.ddp-select{width:100%;padding:7px;margin-top:4px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;font-size:13px}
      .ddp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .ddp-card{background:#111827;border:1px solid #374151;border-left:4px solid #3b82f6;border-radius:8px;padding:9px;margin-bottom:8px}
      .ddp-card.done{border-left-color:#22c55e;opacity:.75}
      .ddp-muted{color:#9ca3af;font-size:12px}
      .ddp-label{display:block;color:#9ca3af;font-size:12px;margin-top:8px}
      .ddp-tag{font-size:11px;padding:2px 7px;border-radius:10px;background:#374151;color:#fff}
      .ddp-tag.done{background:#166534}
      .ddp-tag.taken{background:#854d0e}
      .ddp-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      .ddp-actions button{flex:1;min-width:90px}
      .ddp-msg{margin-top:8px;font-size:12px;color:#86efac}
      .ddp-warn{color:#fca5a5}
    `;
    document.head.appendChild(style);
  }

  function setCommerceBanner(box, text, isWarn = false) {
    lastCommerceMessage = text;
    const msgBox = box && box.querySelector("#ddp-cv-msg");
    if (msgBox) {
      msgBox.className = isWarn ? "ddp-msg ddp-warn" : "ddp-msg";
      msgBox.textContent = text;
    }
  }

  function renderCommerceOverlay() {
    if (!IS_COMMERCE) return;
    injectCommerceStyles();
    let box = document.getElementById("ddp-overlay");
    if (!box) {
      box = document.createElement("div");
      box.id = "ddp-overlay";
      const anchor =
        document.querySelector("#centre, .centre, main, #contenu, .contenu") ||
        document.body.lastElementChild;
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(box, anchor.nextSibling);
      } else {
        document.body.appendChild(box);
      }
    }

    const devUser = getDevUser();
    const isMin = box.classList.contains("ddp-minimized");
    if (isMin) {
      box.innerHTML = `<button class="ddp-btn-mini" id="ddp-restore" type="button">🚚 Convois (${esc(devUser)})</button>`;
      box.querySelector("#ddp-restore").onclick = () => {
        box.classList.remove("ddp-minimized");
        renderCommerceOverlay();
      };
      return;
    }

    const now = Date.now();
    const openCount = convoyRequests.filter((r) => r.status !== "done").length;

    let bodyHtml = "";
    if (convoyTab === "requests") {
      let filtered = convoyRequests
        .slice()
        .sort((a, b) => (a.status === "done") - (b.status === "done") || a.createdAt - b.createdAt);

      if (convoyFilter === "open") filtered = filtered.filter((r) => r.status !== "done");
      else if (convoyFilter === "done") filtered = filtered.filter((r) => r.status === "done");
      else if (convoyFilter === "ongoing") {
        filtered = filtered.filter((r) => r.status !== "done" && hasActiveDelivery(r, now));
      }

      const cardsHtml = !filtered.length
        ? `<div class="ddp-muted">Aucune demande dans cette vue.</div>`
        : filtered
            .map((r) => {
              const done = r.status === "done";
              const rem = reqRemaining(r);
              const del = reqDelivered(r);
              const tag = done
                ? `<span class="ddp-tag done">📦 Archivée</span>`
                : del.wood || del.apples
                  ? `<span class="ddp-tag taken">🚚 Partielle</span>`
                  : `<span class="ddp-tag">🟦 Ouverte</span>`;

              const dr = convoyDrafts[r.id] || {};
              const wVal = dr.wood !== undefined ? dr.wood : rem.wood || 0;
              const aVal = dr.apples !== undefined ? dr.apples : rem.apples || 0;

              const deliveriesSummary =
                Array.isArray(r.deliveries) && r.deliveries.length
                  ? `<div class="ddp-muted" style="margin-top:4px">🚚 Envoyé : ${r.deliveries
                      .map((d) => `${esc(d.by || d.loggedBy || "Joueur")} (🪵 ${formatNumber(d.wood)} · 🍎 ${formatNumber(d.apples)})`)
                      .join(", ")}</div>`
                  : "";

              const sendForm = !done
                ? `
                  <div class="ddp-grid" style="margin-top:8px">
                    ${
                      rem.wood > 0
                        ? `<div><label class="ddp-label">🪵 Bois restant : ${formatNumber(rem.wood)}</label><input class="ddp-input" data-df="wood" data-did="${esc(r.id)}" data-max="${rem.wood}" type="number" min="0" max="${rem.wood}" value="${esc(wVal)}"></div>`
                        : ""
                    }
                    ${
                      rem.apples > 0
                        ? `<div><label class="ddp-label">🍎 Pommes restantes : ${formatNumber(rem.apples)}</label><input class="ddp-input" data-df="apples" data-did="${esc(r.id)}" data-max="${rem.apples}" type="number" min="0" max="${rem.apples}" value="${esc(aVal)}"></div>`
                        : ""
                    }
                  </div>
                  <div class="ddp-actions">
                    <button class="ddp-btn max-btn" data-act="max" data-id="${esc(r.id)}" type="button">Max</button>
                    <button class="ddp-btn primary" style="margin-top:0" data-act="send" data-id="${esc(r.id)}" type="button">🚚 Lancer convoi</button>
                    <button class="ddp-btn" data-act="archive" data-id="${esc(r.id)}" type="button">📦 Archiver</button>
                  </div>
                `
                : `<div class="ddp-actions"><button class="ddp-btn danger" data-act="delete" data-id="${esc(r.id)}" type="button">🗑️ Supprimer</button></div>`;

              return `
                <div class="ddp-card ${done ? "done" : ""}">
                  <div class="ddp-head"><b>${esc(r.player)}</b>${tag}</div>
                  <div>🪵 ${formatNumber(r.wood)} · 🍎 ${formatNumber(r.apples)}${
                    !done && (del.wood || del.apples)
                      ? ` <span class="ddp-muted">(reste 🪵 ${formatNumber(rem.wood)} · 🍎 ${formatNumber(rem.apples)})</span>`
                      : ""
                  }</div>
                  ${deliveriesSummary}
                  ${r.note ? `<div class="ddp-muted" style="margin-top:4px">💬 ${esc(r.note)}</div>` : ""}
                  ${sendForm}
                </div>
              `;
            })
            .join("");

      bodyHtml = `
        <div class="ddp-filters">
          <button class="ddp-filter ${convoyFilter === "open" ? "active" : ""}" data-cf="open" type="button">À traiter (${openCount})</button>
          <button class="ddp-filter ${convoyFilter === "ongoing" ? "active" : ""}" data-cf="ongoing" type="button">🚚 En cours</button>
          <button class="ddp-filter ${convoyFilter === "done" ? "active" : ""}" data-cf="done" type="button">📦 Archives</button>
        </div>
        <div id="ddp-req-list">${cardsHtml}</div>
        <div class="ddp-card" style="margin-top:10px;border-left-color:#22c55e">
          <b>📬 Nouvelle demande de convoi (${esc(devUser)})</b>
          <div class="ddp-grid">
            <div><label class="ddp-label">🪵 Bois</label><input class="ddp-input" id="ddp-new-wood" type="number" min="0" placeholder="0"></div>
            <div><label class="ddp-label">🍎 Pommes</label><input class="ddp-input" id="ddp-new-apples" type="number" min="0" placeholder="0"></div>
          </div>
          <label class="ddp-label">Motif</label>
          <input class="ddp-input" id="ddp-new-note" type="text" maxlength="200" placeholder="Ex : construction / évolution">
          <button class="ddp-btn primary" id="ddp-add-req" type="button">📨 Envoyer la demande</button>
          <div class="ddp-msg" id="ddp-cv-msg">${esc(lastCommerceMessage)}</div>
        </div>
      `;
    } else {
      const destOptions = DEFAULT_PLAYERS.filter((p) => normalizePseudo(p.name) !== normalizePseudo(devUser))
        .map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`)
        .join("");
      bodyHtml = `
        <div class="ddp-card" style="border-left-color:#3b82f6">
          <b>🚚 Déclarer un convoi direct</b>
          <div class="ddp-muted" style="margin-top:4px">Départ : <b>${esc(devUser)}</b></div>
          <label class="ddp-label">Joueur d'arrivée</label>
          <select class="ddp-select" id="ddp-cv-dest">${destOptions}</select>
          <div class="ddp-grid">
            <div><label class="ddp-label">🪵 Bois</label><input class="ddp-input" id="ddp-cv-wood" type="number" min="0" placeholder="0"></div>
            <div><label class="ddp-label">🍎 Pommes</label><input class="ddp-input" id="ddp-cv-apples" type="number" min="0" placeholder="0"></div>
          </div>
          <button class="ddp-btn primary" id="ddp-send-direct" type="button">🚀 Lancer le convoi</button>
          <div class="ddp-msg" id="ddp-cv-msg">${esc(lastCommerceMessage)}</div>
        </div>
      `;
    }

    box.innerHTML = `
      <div class="ddp-head">
        <b>🚚 Convois · ${esc(devUser)}</b>
        <div style="display:flex;gap:6px;align-items:center">
          <input id="ddp-cv-user" class="ddp-input" style="width:110px;margin-top:0;padding:3px 6px;font-size:11px" value="${esc(devUser)}">
          <button class="ddp-btn-mini" id="ddp-cv-user-ok" type="button">OK</button>
          <button class="ddp-btn-mini" id="ddp-min" type="button">_</button>
        </div>
      </div>
      <div class="ddp-tabs">
        <button class="ddp-tab ${convoyTab === "requests" ? "active" : ""}" data-ct="requests" type="button">📋 Demandes (${openCount})</button>
        <button class="ddp-tab ${convoyTab === "send" ? "active" : ""}" data-ct="send" type="button">🚚 Déclarer</button>
      </div>
      ${bodyHtml}
    `;

    box.querySelector("#ddp-min").onclick = () => {
      box.classList.add("ddp-minimized");
      renderCommerceOverlay();
    };

    const userInput = box.querySelector("#ddp-cv-user");
    const applyUser = () => {
      setDevUser(userInput.value);
      renderCommerceOverlay();
      pullFromWorker(true).then((changed) => {
        if (changed) renderCommerceOverlay();
      });
    };
    box.querySelector("#ddp-cv-user-ok").onclick = applyUser;
    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyUser();
      }
    });

    box.querySelectorAll("[data-ct]").forEach((btn) => {
      btn.onclick = () => {
        convoyTab = btn.dataset.ct;
        renderCommerceOverlay();
      };
    });

    box.querySelectorAll("[data-cf]").forEach((btn) => {
      btn.onclick = () => {
        convoyFilter = btn.dataset.cf;
        renderCommerceOverlay();
      };
    });

    box.querySelectorAll("[data-df]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const id = inp.dataset.did;
        const maxVal = clampNonNegativeInt(inp.dataset.max);
        let val = clampNonNegativeInt(inp.value);
        if (val > maxVal) {
          val = maxVal;
          inp.value = String(maxVal);
          setCommerceBanner(box, `⚠️ Maximum autorisé pour cette demande : ${formatNumber(maxVal)}.`, true);
        }
        convoyDrafts[id] = convoyDrafts[id] || {};
        convoyDrafts[id][inp.dataset.df] = val;
      });
    });

    const addReqBtn = box.querySelector("#ddp-add-req");
    if (addReqBtn) {
      addReqBtn.onclick = () => {
        const wood = clampNonNegativeInt(box.querySelector("#ddp-new-wood").value);
        const apples = clampNonNegativeInt(box.querySelector("#ddp-new-apples").value);
        const note = String(box.querySelector("#ddp-new-note").value || "").trim();
        if (wood <= 0 && apples <= 0) {
          setCommerceBanner(box, "⚠️ Indique du bois et/ou des pommes.", true);
          return;
        }
        if (!note) {
          setCommerceBanner(box, "⚠️ Le motif est obligatoire.", true);
          return;
        }
        const newReq = {
          id: Date.now() + "_" + Math.floor(Math.random() * 1e6),
          player: getDevUser(),
          wood,
          apples,
          note,
          status: "open",
          deliveries: [],
          createdAt: Date.now(),
          createdBy: getDevUser()
        };
        convoyRequests.push(newReq);
        saveConvoyRequestsLocal();
        syncWithWorker({ kind: "requests", action: "create", request: newReq }, false);
        setCommerceBanner(box, "✓ Demande de convoi enregistrée.", false);
        renderCommerceOverlay();
      };
    }

    const sendDirectBtn = box.querySelector("#ddp-send-direct");
    if (sendDirectBtn) {
      sendDirectBtn.onclick = () => {
        const sender = findPlayerByPseudo(getDevUser()) || { name: getDevUser(), x: 0, y: 0, va: 0 };
        const destName = box.querySelector("#ddp-cv-dest").value;
        const dest = findPlayerByPseudo(destName) || { name: destName, x: 0, y: 0, va: 0 };
        const wood = clampNonNegativeInt(box.querySelector("#ddp-cv-wood").value);
        const apples = clampNonNegativeInt(box.querySelector("#ddp-cv-apples").value);
        if (wood <= 0 && apples <= 0) {
          setCommerceBanner(box, "⚠️ Indique du bois et/ou des pommes.", true);
          return;
        }
        const dur = calcTravelSeconds(sender, dest);
        const tNow = Date.now();
        const mv = {
          id: tNow + "_" + Math.floor(Math.random() * 1e6),
          type: "convoy",
          from: sender,
          to: dest,
          duration: dur,
          startAt: tNow,
          arrivalAt: tNow + dur * 1000,
          wood,
          apples,
          createdBy: getDevUser()
        };
        const mvs = readJsonArray(STORAGE_KEYS.movements);
        mvs.push(mv);
        writeJsonArray(STORAGE_KEYS.movements, mvs);
        syncWithWorker({ kind: "movements", action: "create", movement: mv }, false);
        convoyLog.push({ from: sender.name, to: dest.name, wood, apples, arrivalAt: tNow + dur * 1000 });
        saveConvoyLog();
        fillCommerceFormFields({ recipient: dest.name, apples, wood });
        setCommerceBanner(box, `✓ Convoi enregistré (${formatDuration(dur)}) et champs pré-remplis pour ${dest.name}.`, false);
        renderCommerceOverlay();
      };
    }

    box.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.onclick = () => {
        const r = convoyRequests.find((item) => item.id === btn.dataset.id);
        if (!r) return;
        const act = btn.dataset.act;
        if (act === "archive") {
          r.status = "done";
          r.doneAt = Date.now();
          r.archivedBy = getDevUser();
          saveConvoyRequestsLocal();
          syncWithWorker({ kind: "requests", action: "archive", id: r.id, doneAt: r.doneAt }, false);
          renderCommerceOverlay();
        } else if (act === "delete") {
          convoyRequests = convoyRequests.filter((item) => item.id !== r.id);
          saveConvoyRequestsLocal();
          syncWithWorker({ kind: "requests", action: "delete", id: r.id }, false);
          renderCommerceOverlay();
        } else if (act === "max") {
          const rem = reqRemaining(r);
          convoyDrafts[r.id] = {
            wood: rem.wood,
            apples: rem.apples
          };
          setCommerceBanner(box, `✓ Quantités réglées au maximum restant pour ${r.player}.`, false);
          renderCommerceOverlay();
        } else if (act === "send") {
          const card = btn.closest(".ddp-card");
          const rem = reqRemaining(r);
          const wInp = card.querySelector('[data-df="wood"]');
          const aInp = card.querySelector('[data-df="apples"]');
          const rawWood = wInp ? clampNonNegativeInt(wInp.value) : 0;
          const rawApples = aInp ? clampNonNegativeInt(aInp.value) : 0;

          if (rawWood > rem.wood || rawApples > rem.apples) {
            setCommerceBanner(
              box,
              `⚠️ Impossible d'envoyer plus que le reste demandé (max 🪵 ${formatNumber(rem.wood)} · 🍎 ${formatNumber(rem.apples)}).`,
              true
            );
            return;
          }

          const wood = Math.min(rem.wood, rawWood);
          const apples = Math.min(rem.apples, rawApples);

          if (wood <= 0 && apples <= 0) {
            setCommerceBanner(box, "⚠️ Indique une quantité supérieure à 0.", true);
            return;
          }

          const sender = findPlayerByPseudo(getDevUser()) || { name: getDevUser(), x: 0, y: 0, va: 0 };
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
            createdBy: getDevUser()
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
            loggedBy: getDevUser(),
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
          fillCommerceFormFields({ recipient: dest.name, apples, wood });

          setCommerceBanner(
            box,
            isPartial
              ? `✓ Convoi partiel enregistré (🪵 ${formatNumber(wood)} · 🍎 ${formatNumber(apples)}) vers ${dest.name}. Visible dans En cours.`
              : `✓ Convoi complet enregistré vers ${dest.name}.`,
            false
          );
          renderCommerceOverlay();
        }
      };
    });
  }

  function tickCountdowns() {
    if (!IS_RESSOURCES) return;
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
    } else if (IS_ARMEE) {
      ensureArmeeIndicator();
      reconcileArmeeAttacks();
    } else if (IS_COMMERCE) {
      const active = document.activeElement;
      if (active && active.closest && active.closest("#ddp-overlay")) return;
      renderCommerceOverlay();
    }
  }

  runPageCycle();
  pullFromWorker(true).then((changed) => {
    if (changed) runPageCycle();
  });

  if (IS_RESSOURCES) {
    setInterval(tickCountdowns, 1000);
  }

  setInterval(() => {
    const active = document.activeElement;
    if (active && (active.id === "fmz-dev-input" || active.id === "ddp-cv-user")) return;
    runPageCycle();
  }, 5000);

  setInterval(() => {
    const active = document.activeElement;
    if (active && active.closest && active.closest("#ddp-overlay")) return;
    if (active && active.id === "fmz-dev-input") return;
    pullFromWorker(false).then((changed) => {
      if (changed) runPageCycle();
    });
  }, 15000);

  window.addEventListener("storage", (e) => {
    if (
      e.key === STORAGE_KEYS.attacks ||
      e.key === STORAGE_KEYS.hunts ||
      e.key === STORAGE_KEYS.devUser ||
      e.key === STORAGE_KEYS.convoyRequests
    ) {
      runPageCycle();
    }
  });
})();
