async function resolverCover(title, apiKey) {
  const variantes = generateVariants(title);

  // 🧠 fallback extra agresivo
  const fallbackExtra = [
    title.split(':')[0], // corta subtítulos
    title.split('-')[0], // corta versiones
    title.split('|')[0],
    title.split('(')[0],
  ].map(t => t.trim()).filter(Boolean);

  const todasLasVariantes = [...new Set([...variantes, ...fallbackExtra])];

  for (const variant of todasLasVariantes) {
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
