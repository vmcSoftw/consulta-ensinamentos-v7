import { searchArchive } from '@/lib/search';
import PrintControls from './PrintControls';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function sortLabel(sort: string) {
  if (sort === 'oldest') return 'Ordem cronológica - mais antigos primeiro';
  if (sort === 'recent') return 'Ordem cronológica - mais recentes primeiro';
  return 'Mais relevantes';
}

export default async function PrintPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const year = one(sp.year);
  const category = one(sp.category);
  const type = one(sp.type);
  const sort = one(sp.sort) || 'relevance';

  const result = q ? await searchArchive(q, {
    year: year ? Number(year) : null,
    category,
    type,
    sort,
    limit: 5000,
    offset: 0,
    includeContent: true
  }) : { items: [], total: 0, expandedTerms: [], hasMore: false };

  return (
    <main className="printPage">
      <PrintControls />
      <header className="printHeader">
        <div className="printBrand">CE</div>
        <div><small>Consulta de Ensinamentos</small><h1>Relatório de Pesquisa</h1></div>
      </header>
      <section className="printSummary">
        <div><b>Pesquisa</b><span>{q || 'Não informada'}</span></div>
        <div><b>Ordenação</b><span>{sortLabel(sort)}</span></div>
        {year && <div><b>Ano</b><span>{year}</span></div>}
        {type && <div><b>Tipo</b><span>{type}</span></div>}
        {category && <div><b>Categoria</b><span>{category}</span></div>}
        <div><b>Resultados</b><span>{result.total}</span></div>
      </section>
      {result.expandedTerms.length > 1 && <div className="printTerms"><b>Termos relacionados:</b> {result.expandedTerms.slice(0, 20).join(' · ')}</div>}
      <section className="printResults">
        {result.items.map((item: any, index: number) => (
          <article className="printItem" key={item.id}>
            <div className="printNumber">{String(index + 1).padStart(2, '0')}</div>
            <div>
              <div className="printMeta">{item.year || 'Sem ano'} · {item.source_type} · página {item.page_start}</div>
              <h2>{item.topic_number ? `${item.topic_number}. ` : ''}{item.title}</h2>
              <p>{item.content || item.excerpt}</p>
              {item.category && <div className="printCategory">{item.category}</div>}
            </div>
          </article>
        ))}
      </section>
      {!result.items.length && <p className="printEmpty">Nenhum resultado encontrado.</p>}
      <footer className="printFooter">Relatório gerado pela Consulta de Ensinamentos V7.</footer>
    </main>
  );
}
