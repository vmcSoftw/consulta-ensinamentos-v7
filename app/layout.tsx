import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Consulta de Ensinamentos',
  description: 'Pesquisa bíblica, histórica e documental de ensinamentos, Bíblia, dicionário e documentos.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
