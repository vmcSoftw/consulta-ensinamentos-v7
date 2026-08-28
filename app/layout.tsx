import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Consulta de Ensinamentos V7',
  description: 'Pesquisa histórica, perguntas documentais, impressão e compilações do acervo de ensinamentos'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
