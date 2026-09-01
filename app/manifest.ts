import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Consulta de Ensinamentos',
    short_name: 'Ensinamentos',
    description: 'Pesquisa bíblica, histórica e documental.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f5f0',
    theme_color: '#13243d',
    lang: 'pt-BR',
    icons: [
      { src: '/consulta-ensinamentos-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/consulta-ensinamentos-icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  };
}
