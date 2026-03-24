const TGDB_BASE_V1 = 'https://api.thegamesdb.net/v1';
const TGDB_BASE_V11 = 'https://api.thegamesdb.net/v1.1';
const PLATFORM_PS4 = 4919;
const PLATFORM_PS5 = 4980;

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function limpiarTituloBase(texto) {
  return String(texto || '')
    .replace(/^[🔥🎮📱⭐💣\s]+/g, '')
    .replace(/\b(PS4-PS5|PS4\/PS5|PS5|PS4)\b/gi, '')
    .replace(/[™®©]/g, '')
    .replace(/[-–—|:]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function simplificarTitulo(texto) {
  return limpiarTituloBase(texto)
    .replace(/\b(THE COLLECTION|COLLECTION|LEGACY COLLECTION|REMASTERED|REMASTER|DEFINITIVE EDITION|DEFINITIVE|DELUXE EDITION|DELUXE|ULTIMATE EDITION|ULTIMATE|COMPLETE EDITION|COMPLETE|GOLD EDITION|GOLD|SPECIAL EDITION|SPECIAL|DIRECTORS CUT|DIRECTOR'S CUT|BUNDLE|PACK)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function scoreMatch(input, candidate) {
  const a = normalize(input);
  const b = normalize(candidate);

  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.startsWith(a)) return 90;
  if (b.includes(a)) return 75;
  if (a.includes(b)) return 65;

  const words = a.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const word of words) {
    if (b.includes(word)) score += 8;
  }
  return score;
}

function generateVariants(title) {
  const limpio = limpiarTituloBase(title);
  const simple = simplificarTitulo(title);

  const variants = new Set();
  if (limpio) variants.add(limpio);
  if (simple) variants.add(simple);

  const upper = normalize(simple).toUpperCase();

  const aliases = {
    'ALIEN INSOLATION THE COLLECTION': ['Alien Isolation', 'Alien: Isolation'],
    'ASSASSINS CREED ODYSSEY': ["Assassin's Creed Odyssey"],
    'ASSASSINS CREED ORIGINS': ["Assassin's Creed Origins"],
    'ASSASSINS CREED VALHALLA': ["Assassin's Creed Valhalla"],
    'ASSASSINS CREED ROGUE REMASTERED': ["Assassin's Creed Rogue Remastered", "Assassin's Creed Rogue"],
    'ASSASSINS CREED MIRAGE': ["Assassin's Creed Mirage"],
    'ASSASSINS CREED UNITY': ["Assassin's Creed Unity"],
    'ASTROBOT': ['Astro Bot', 'Astrobot'],
    'CRASH TEAM RACING NITRO FUELED': ['Crash Team Racing Nitro-Fueled'],
    'CRISIS CORE FINAL FANTASY VII REUNION': ['Crisis Core Final Fantasy VII Reunion'],
    'GTA V': ['Grand Theft Auto V', 'GTA 5'],
    'GRAND THEFT AUTO V': ['Grand Theft Auto V', 'GTA V'],
    'THE LAST OF US PART I': ['The Last of Us Part I'],
    'THE LAST OF US PART II': ['The Last of Us Part II'],
    'WORLD WAR Z AFTERMATH': ['World War Z Aftermath'],
    'WRC 10 RALLY': ['WRC 10'],
    'WRC 10': ['WRC 10'],
    'YU GI OH LEGACY OF THE DUELIST': ['Yu-Gi-Oh! Legacy of the Duelist'],
    'CALL OF DUTY MODERN WARFARE 3': ['Call of Duty Modern Warfare III', 'Modern Warfare 3'],
    'CALL OF DUTY MODERN WARFARE 2': ['Call of Duty Modern Warfare II', 'Modern Warfare 2'],
    'CALL OF DUTY BLACK OPS 3': ['Call of Duty Black Ops III'],
    'CALL OF DUTY BLACK OPS 4': ['Call of Duty Black Ops 4'],
    'ABZU': ['ABZU']
  };

  Object.entries(aliases).forEach(([key, list]) => {
    if (upper === key || upper.includes(key)) {
      list.forEach(v => variants.add(v));
    }
  });

  [limpio, simple].forEach(v => {
    if (!v) return;
    const byColon = v.split(':')[0]?.trim();
    const byDash = v.split('-')[0]?.trim();
    const byParen = v.split('(')[0]?.trim();
    if (byColon) variants.add(byColon);
    if (byDash) variants.add(byDash);
    if (byParen) variants.add(byParen);
  });

  return Array.from(variants).filter(Boolean);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 AREA51 Covers'
    }
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function tgdbFetch(path, apiKey) {
  const urls = [
    `${TGDB_BASE_V11}${path}${path.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(apiKey)}`,
    `${TGDB_BASE_V1}${path}${path.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(apiKey)}`
  ];

  for (const url of urls) {
    const { ok, text } = await fetchText(url);
    const json = safeJsonParse(text);
    if (ok && json) return json;
  }

  return null;
}

async function buscarJuegoPorNombre(nombre, apiKey) {
  const data = await tgdbFetch(`/Games/ByGameName?name=${encodeURIComponent(nombre)}`, apiKey);
  const games = Array.isArray(data?.data?.games) ? data.data.games : [];
  if (!games.length) return null;

  const filtrados = games.filter(g => {
    const p = Number(g.platform);
    return p === PLATFORM_PS4 || p === PLATFORM_PS5;
  });

  const candidatos = filtrados.length ? filtrados : games;

  const ordenados = candidatos
    .map(item => ({
      item,
      score: scoreMatch(nombre, item.game_title)
    }))
    .sort((a, b) => b.score - a.score);

  return ordenados[0]?.item || null;
}

async function buscarDetalleJuego(gameId, apiKey) {
  return tgdbFetch(`/Games/ByGameID?id=${encodeURIComponent(gameId)}&include=boxart,platform`, apiKey);
}

async function buscarImagenesJuego(gameId, apiKey) {
  return tgdbFetch(`/Games/Images?games_id=${encodeURIComponent(gameId)}`, apiKey);
}

function resolverUrlCoverDesdeDetalle(data, gameId) {
  const base =
    data?.include?.boxart?.base_url?.original ||
    data?.include?.boxart?.base_url?.medium ||
    data?.include?.boxart?.base_url?.small ||
    '';

  const gameImages = data?.include?.boxart?.data?.[String(gameId)] || [];
  if (!base || !Array.isArray(gameImages) || !gameImages.length) return null;

  const front =
    gameImages.find(img => String(img.side || '').toLowerCase() === 'front') ||
    gameImages.find(img => String(img.type || '').toLowerCase() === 'boxart') ||
    gameImages[0];

  if (!front) return null;

  const filename = front.filename || front.file_name || front.url || '';
  if (!filename) return null;

  if (/^https?:\/\//i.test(filename)) return filename;

  return base.replace(/\/+$/, '/') + String(filename).replace(/^\/+/, '');
}

function resolverUrlCoverDesdeImages(data, gameId) {
  const base =
    data?.data?.base_url?.original ||
    data?.data?.base_url?.medium ||
    data?.data?.base_url?.small ||
    '';

  if (!base) return null;

  const imagesRoot = data?.data?.images;
  if (!imagesRoot) return null;

  let candidates = null;

  if (Array.isArray(imagesRoot?.[String(gameId)])) {
    candidates = imagesRoot[String(gameId)];
  } else if (Array.isArray(imagesRoot?.boxart)) {
    candidates = imagesRoot.boxart;
  } else if (Array.isArray(imagesRoot?.boxart?.front)) {
    candidates = imagesRoot.boxart.front;
  }

  if (!Array.isArray(candidates) || !candidates.length) return null;

  const front =
    candidates.find(img => String(img.side || '').toLowerCase() === 'front') ||
    candidates.find(img => String(img.type || '').toLowerCase() === 'boxart') ||
    candidates[0];

  if (!front) return null;

  const filename = front.filename || front.file_name || front.url || '';
  if (!filename) return null;

  if (/^https?:\/\//i.test(filename)) return filename;

  return base.replace(/\/+$/, '/') + String(filename).replace(/^\/+/, '');
}

async function buscarEnBingImagenDirecta(title) {
  const query = encodeURIComponent(`${title} ps4 ps5 game cover`);
  const url = `https://www.bing.com/images/search?q=${query}&form=HDRSC3`;

  const { ok, text } = await fetchText(url);
  if (!ok || !text) return null;

  const patterns = [
    /"murl":"(https?:\/\/[^"]+)"/i,
    /murl&quot;:&quot;(https?:\/\/[^"&]+)"/i,
    /"turl":"(https?:\/\/[^"]+)"/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1]
        .replace(/\\u002f/g, '/')
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&');
    }
  }

  return null;
}

async function resolverCover(title, apiKey) {
  const variants = generateVariants(title);

  for (const variant of variants) {
    const juego = await buscarJuegoPorNombre(variant, apiKey);

    if (juego?.id) {
      let coverUrl = null;

      try {
        const detalle = await buscarDetalleJuego(juego.id, apiKey);
        coverUrl = resolverUrlCoverDesdeDetalle(detalle, juego.id);
      } catch (_) {}

      if (!coverUrl) {
        try {
          const images = await buscarImagenesJuego(juego.id, apiKey);
          coverUrl = resolverUrlCoverDesdeImages(images, juego.id);
        } catch (_) {}
      }

      if (coverUrl) {
        return { title, coverUrl };
      }
    }

    const bingCover = await buscarEnBingImagenDirecta(variant);
    if (bingCover) {
      return { title, coverUrl: bingCover };
    }
  }

  return { title, coverUrl: null };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.TGDB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Falta TGDB_API_KEY en Vercel' });
  }

  try {
    const titles = Array.isArray(req.body?.titles) ? req.body.titles : [];
    const cleanTitles = titles.map(t => String(t || '').trim()).filter(Boolean);

    const results = [];
    for (const title of cleanTitles) {
      try {
        results.push(await resolverCover(title, apiKey));
      } catch (err) {
        results.push({
          title,
          coverUrl: null
        });
      }
    }

    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Error interno'
    });
  }
}
