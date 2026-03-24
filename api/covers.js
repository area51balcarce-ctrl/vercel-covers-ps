const TGDB_BASE = 'https://api.thegamesdb.net/v1';
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

function limpiarTituloBase(texto) {
  return String(texto)
    .replace(/^[🔥🎮📱⭐💣\s]+/g, '')
    .replace(/\b(PS4-PS5|PS4\/PS5|PS5|PS4)\b/gi, '')
    .replace(/[™®©]/g, '')
    .replace(/[-–—|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function simplificarTitulo(texto) {
  return limpiarTituloBase(texto)
    .replace(/\b(THE COLLECTION|COLLECTION|LEGACY COLLECTION|REMASTERED|REMASTER|DEFINITIVE EDITION|DEFINITIVE|DELUXE EDITION|DELUXE|ULTIMATE EDITION|ULTIMATE|COMPLETE EDITION|COMPLETE|GOLD EDITION|GOLD|SPECIAL EDITION|SPECIAL|DIRECTORS CUT|DIRECTOR'S CUT|BUNDLE|PACK)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function generateVariants(title) {
  const limpio = limpiarTituloBase(title);
  const simple = simplificarTitulo(title);
  const upper = normalize(simple).toUpperCase();

  const out = new Set();
  if (limpio) out.add(limpio);
  if (simple) out.add(simple);

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
    'CALL OF DUTY BLACK OPS 4': ['Call of Duty Black Ops 4']
  };

  Object.entries(aliases).forEach(([key, list]) => {
    if (upper === key || upper.includes(key)) {
      list.forEach(v => out.add(v));
    }
  });

  return Array.from(out).filter(Boolean);
}

async function tgdbFetch(path, apiKey) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${TGDB_BASE}${path}${sep}apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TGDB ${res.status}: ${text.slice(0, 160)}`);
  }

  return res.json();
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
    gameImages.find(img => String(img.side).toLowerCase() === 'front') ||
    gameImages.find(img => String(img.type).toLowerCase() === 'boxart') ||
    gameImages[0];

  if (!front?.filename) return null;

  return base.replace(/\/+$/, '/') + String(front.filename).replace(/^\/+/, '');
}

function resolverUrlCoverDesdeImages(data, gameId) {
  const base =
    data?.data?.base_url?.original ||
    data?.data?.base_url?.medium ||
    data?.data?.base_url?.small ||
    '';

  const imagesRoot = data?.data?.images;
  if (!imagesRoot || !base) return null;

  let candidates = null;

  if (Array.isArray(imagesRoot?.[String(gameId)])) {
    candidates = imagesRoot[String(gameId)];
  } else if (imagesRoot?.boxart && Array.isArray(imagesRoot.boxart)) {
    candidates = imagesRoot.boxart;
  } else if (imagesRoot?.boxart?.front && Array.isArray(imagesRoot.boxart.front)) {
    candidates = imagesRoot.boxart.front;
  }

  if (!Array.isArray(candidates) || !candidates.length) return null;

  const front =
    candidates.find(img => String(img.side || '').toLowerCase() === 'front') ||
    candidates.find(img => String(img.type || '').toLowerCase() === 'boxart') ||
    candidates[0];

  const filename = front?.filename || front?.file_name || front?.url || '';
  if (!filename) return null;

  if (/^https?:\/\//i.test(filename)) return filename;

  return base.replace(/\/+$/, '/') + String(filename).replace(/^\/+/, '');
}

async function resolverCover(title, apiKey) {
  const variants = generateVariants(title);

  for (const variant of variants) {
    const juego = await buscarJuegoPorNombre(variant, apiKey);
    if (!juego?.id) continue;

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
        results.push({ title, coverUrl: null, error: err.message });
      }
    }

    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
}
