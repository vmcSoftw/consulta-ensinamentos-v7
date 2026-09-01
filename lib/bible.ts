import { pool } from '@/lib/db';

export type BibleBook = {
  order: number;
  name: string;
  abbreviation: string;
  testament: 'AT' | 'NT';
  chapters: number;
};

export const BIBLE_BOOKS: BibleBook[] = [
  [1,'Gênesis','Gn','AT',50],[2,'Êxodo','Êx','AT',40],[3,'Levítico','Lv','AT',27],[4,'Números','Nm','AT',36],[5,'Deuteronômio','Dt','AT',34],
  [6,'Josué','Js','AT',24],[7,'Juízes','Jz','AT',21],[8,'Rute','Rt','AT',4],[9,'1Samuel','1Sm','AT',31],[10,'2Samuel','2Sm','AT',24],
  [11,'1Reis','1Rs','AT',22],[12,'2Reis','2Rs','AT',25],[13,'1Crônicas','1Cr','AT',29],[14,'2Crônicas','2Cr','AT',36],[15,'Esdras','Ed','AT',10],
  [16,'Neemias','Ne','AT',13],[17,'Ester','Et','AT',10],[18,'Jó','Jó','AT',42],[19,'Salmos','Sl','AT',150],[20,'Provérbios','Pv','AT',31],
  [21,'Eclesiastes','Ec','AT',12],[22,'Cantares','Ct','AT',8],[23,'Isaías','Is','AT',66],[24,'Jeremias','Jr','AT',52],[25,'Lamentações','Lm','AT',5],
  [26,'Ezequiel','Ez','AT',48],[27,'Daniel','Dn','AT',12],[28,'Oseias','Os','AT',14],[29,'Joel','Jl','AT',3],[30,'Amós','Am','AT',9],
  [31,'Obadias','Ob','AT',1],[32,'Jonas','Jn','AT',4],[33,'Miqueias','Mq','AT',7],[34,'Naum','Na','AT',3],[35,'Habacuque','Hc','AT',3],
  [36,'Sofonias','Sf','AT',3],[37,'Ageu','Ag','AT',2],[38,'Zacarias','Zc','AT',14],[39,'Malaquias','Ml','AT',4],
  [40,'Mateus','Mt','NT',28],[41,'Marcos','Mc','NT',16],[42,'Lucas','Lc','NT',24],[43,'João','Jo','NT',21],[44,'Atos','At','NT',28],
  [45,'Romanos','Rm','NT',16],[46,'1Coríntios','1Co','NT',16],[47,'2Coríntios','2Co','NT',13],[48,'Gálatas','Gl','NT',6],[49,'Efésios','Ef','NT',6],
  [50,'Filipenses','Fp','NT',4],[51,'Colossenses','Cl','NT',4],[52,'1Tessalonicenses','1Ts','NT',5],[53,'2Tessalonicenses','2Ts','NT',3],
  [54,'1Timóteo','1Tm','NT',6],[55,'2Timóteo','2Tm','NT',4],[56,'Tito','Tt','NT',3],[57,'Filemom','Fm','NT',1],[58,'Hebreus','Hb','NT',13],
  [59,'Tiago','Tg','NT',5],[60,'1Pedro','1Pe','NT',5],[61,'2Pedro','2Pe','NT',3],[62,'1João','1Jo','NT',5],[63,'2João','2Jo','NT',1],
  [64,'3João','3Jo','NT',1],[65,'Judas','Jd','NT',1],[66,'Apocalipse','Ap','NT',22]
].map(([order,name,abbreviation,testament,chapters]) => ({
  order: order as number,
  name: name as string,
  abbreviation: abbreviation as string,
  testament: testament as 'AT'|'NT',
  chapters: chapters as number
}));

export function normalizeBible(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g,' ').trim();
}

const MANUAL_ALIASES: Record<string,string[]> = {
  'Gênesis':['genesis','gen','gn'], 'Êxodo':['exodo','ex','exodo','êx'], 'Levítico':['levitico','lev','lv'], 'Números':['numeros','num','nm'],
  'Deuteronômio':['deuteronomio','deut','dt'], 'Josué':['josue','js'], 'Juízes':['juizes','jz'], 'Rute':['rt'],
  '1Samuel':['1 samuel','1samuel','1 sam','1sm','i samuel'], '2Samuel':['2 samuel','2samuel','2 sam','2sm','ii samuel'],
  '1Reis':['1 reis','1reis','1 rs','1rs','i reis'], '2Reis':['2 reis','2reis','2 rs','2rs','ii reis'],
  '1Crônicas':['1 cronicas','1cronicas','1 cr','1cr','i cronicas'], '2Crônicas':['2 cronicas','2cronicas','2 cr','2cr','ii cronicas'],
  'Esdras':['ed'], 'Neemias':['ne'], 'Ester':['et'], 'Jó':['jo','jó'], 'Salmos':['salmo','salmos','sl'], 'Provérbios':['proverbios','pv'],
  'Eclesiastes':['ec'], 'Cantares':['cantico dos canticos','cântico dos cânticos','ct'], 'Isaías':['isaias','is'], 'Jeremias':['jr'], 'Lamentações':['lamentacoes','lm'],
  'Ezequiel':['ez'], 'Daniel':['dn'], 'Oseias':['os'], 'Joel':['jl'], 'Amós':['amos','am'], 'Obadias':['ob'], 'Jonas':['jn'], 'Miqueias':['mq'], 'Naum':['na'],
  'Habacuque':['hc'], 'Sofonias':['sf'], 'Ageu':['ag'], 'Zacarias':['zc'], 'Malaquias':['ml'], 'Mateus':['mt'], 'Marcos':['mc'], 'Lucas':['lc'],
  'João':['joao','jo','evangelho de joao'], 'Atos':['atos dos apostolos','atos dos apóstolos','at'], 'Romanos':['romanos','rm'],
  '1Coríntios':['1 corintios','1corintios','1 co','1co','i corintios'], '2Coríntios':['2 corintios','2corintios','2 co','2co','ii corintios'],
  'Gálatas':['galatas','gl'], 'Efésios':['efesios','ef'], 'Filipenses':['fp'], 'Colossenses':['cl'],
  '1Tessalonicenses':['1 tessalonicenses','1tessalonicenses','1 ts','1ts','i tessalonicenses'], '2Tessalonicenses':['2 tessalonicenses','2tessalonicenses','2 ts','2ts','ii tessalonicenses'],
  '1Timóteo':['1 timoteo','1timoteo','1 tm','1tm','i timoteo'], '2Timóteo':['2 timoteo','2timoteo','2 tm','2tm','ii timoteo'],
  'Tito':['tt'], 'Filemom':['fm'], 'Hebreus':['hb'], 'Tiago':['tg'], '1Pedro':['1 pedro','1pedro','1 pe','1pe','i pedro'], '2Pedro':['2 pedro','2pedro','2 pe','2pe','ii pedro'],
  '1João':['1 joao','1joao','1 jo','1jo','i joao'], '2João':['2 joao','2joao','2 jo','2jo','ii joao'], '3João':['3 joao','3joao','3 jo','3jo','iii joao'],
  'Judas':['jd'], 'Apocalipse':['ap','apoc']
};

const aliasEntries = BIBLE_BOOKS.flatMap(book => {
  const base = [book.name, book.abbreviation, ...(MANUAL_ALIASES[book.name] || [])];
  // "Jo" é usado de forma corrente para João; Jó é tratado antes, preservando o acento.
  const values = new Set(book.name === 'Jó' ? base.filter(v => normalizeBible(v) !== 'jo') : base);
  return [...values].map(alias => ({ alias: normalizeBible(alias).replace(/\s+/g,''), aliasSpaced: normalizeBible(alias), book }));
}).sort((a,b) => Math.max(b.alias.length,b.aliasSpaced.length)-Math.max(a.alias.length,a.aliasSpaced.length));

export function aliasesForBook(book: BibleBook) {
  const values = new Set([book.name, book.abbreviation, ...(MANUAL_ALIASES[book.name] || [])]);
  return [...values];
}

export type ParsedBibleReference = {
  book: BibleBook;
  chapter?: number;
  verseStart?: number;
  verseEnd?: number;
};

export function parseBibleReference(input: string): ParsedBibleReference | null {
  const original = input.trim();
  if (!original) return null;
  const accentedJob = original.match(/^Jó\s+(\d{1,3})(?:(?:[:.,]|\s+)(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?$/i);
  if (accentedJob) {
    const book = BIBLE_BOOKS.find(b => b.name === 'Jó')!;
    const chapter = Number(accentedJob[1]);
    if (chapter < 1 || chapter > book.chapters) return null;
    const verseStart = accentedJob[2] ? Number(accentedJob[2]) : undefined;
    return { book, chapter, verseStart, verseEnd: accentedJob[3] ? Number(accentedJob[3]) : verseStart };
  }
  const normalized = normalizeBible(original);
  const compact = normalized.replace(/\s+/g,'');
  for (const entry of aliasEntries) {
    const candidates = [entry.aliasSpaced, entry.alias];
    for (const alias of candidates) {
      const source = alias.includes(' ') ? normalized : compact;
      if (!source.startsWith(alias)) continue;
      let rest = source.slice(alias.length).trim();
      rest = rest.replace(/^[-–—]+/,'').trim();
      if (!rest) return { book: entry.book };
      const m = rest.match(/^(\d{1,3})(?:(?:[:.,]|\s+)(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?$/);
      if (!m) continue;
      const firstNumber = Number(m[1]);
      if (entry.book.chapters === 1 && !m[2]) {
        return { book: entry.book, chapter: 1, verseStart: firstNumber, verseEnd: firstNumber };
      }
      const chapter = firstNumber;
      if (chapter < 1 || chapter > entry.book.chapters) return null;
      const verseStart = m[2] ? Number(m[2]) : undefined;
      const verseEnd = m[3] ? Number(m[3]) : verseStart;
      return { book: entry.book, chapter, verseStart, verseEnd };
    }
  }
  return null;
}

export async function getBibleStats() {
  try {
    const row = (await pool.query(`
      SELECT
        (SELECT count(*)::int FROM bible_books b JOIN bible_versions v ON v.id=b.version_id WHERE v.code='ARC2009') AS books,
        (SELECT count(DISTINCT (bv.book_order,bv.chapter))::int FROM bible_verses bv JOIN bible_versions v ON v.id=bv.version_id WHERE v.code='ARC2009') AS chapters,
        (SELECT count(*)::int FROM bible_verses bv JOIN bible_versions v ON v.id=bv.version_id WHERE v.code='ARC2009') AS verses
    `)).rows[0];
    return row;
  } catch {
    return { books: 0, chapters: 0, verses: 0 };
  }
}

export async function searchBible(query: string, limit=80) {
  const clean=query.trim();
  const parsed=parseBibleReference(clean);
  const maxLimit=Math.min(Math.max(Number(limit)||80,1),200);

  if (parsed) {
    const params: unknown[]=[parsed.book.order];
    const where=[`bv.book_order=$1`];
    if (parsed.chapter) { params.push(parsed.chapter); where.push(`bv.chapter=$${params.length}`); }
    if (parsed.verseStart) {
      params.push(parsed.verseStart, parsed.verseEnd || parsed.verseStart);
      where.push(`bv.verse BETWEEN $${params.length-1} AND $${params.length}`);
    }
    const items=(await pool.query(`
      SELECT bv.id,b.book_order,b.name AS book,b.abbreviation,bv.chapter,bv.verse,bv.text,bv.pdf_page
      FROM bible_verses bv
      JOIN bible_books b ON b.id=bv.book_id
      JOIN bible_versions v ON v.id=bv.version_id
      WHERE v.code='ARC2009' AND ${where.join(' AND ')}
      ORDER BY bv.chapter,bv.verse
      LIMIT 200
    `,params)).rows;
    return { mode:'reference', parsed, items, total:items.length, query:clean };
  }

  const normalized=normalizeBible(clean);
  const textNorm = `lower(translate(bv.text,
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))`;
  const rows=(await pool.query(`
    SELECT * FROM (
      SELECT bv.id,b.book_order,b.name AS book,b.abbreviation,bv.chapter,bv.verse,bv.text,bv.pdf_page,
        (CASE WHEN ${textNorm} LIKE $2 THEN 20 ELSE 0 END +
         ts_rank_cd(to_tsvector('portuguese'::regconfig,bv.text), websearch_to_tsquery('portuguese'::regconfig,$1))*12) AS score
      FROM bible_verses bv
      JOIN bible_books b ON b.id=bv.book_id
      JOIN bible_versions v ON v.id=bv.version_id
      WHERE v.code='ARC2009' AND (
        to_tsvector('portuguese'::regconfig,bv.text) @@ websearch_to_tsquery('portuguese'::regconfig,$1)
        OR ${textNorm} LIKE $2
      )
    ) ranked
    ORDER BY score DESC,book_order,chapter,verse
    LIMIT $3
  `,[clean,`%${normalized}%`,maxLimit])).rows;
  return { mode:'text', parsed:null, items:rows, total:rows.length, query:clean };
}

function regexEscape(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

export async function relatedTeachings(bookOrder:number,chapter:number,verse:number,limit=12){
  const book=BIBLE_BOOKS.find(b=>b.order===bookOrder);
  if(!book) return [];
  const aliases=aliasesForBook(book).map(regexEscape).sort((a,b)=>b.length-a.length);
  const bookPart=`(?:${aliases.join('|')})`;
  const regex=`(^|[^[:alnum:]])${bookPart}[.]?[[:space:]]*(?:cap(?:[íi]tulo)?[.]?[[:space:]]*)?${chapter}[[:space:]]*(?::|\\.|,|(?:[,;]?[[:space:]]*(?:v(?:s)?|ver(?:s(?:[íi]culo)?s?)?)[.]?))[[:space:]]*${verse}([^0-9]|$)`;
  return (await pool.query(`
    SELECT t.id,s.year,s.source_type,t.title,t.page_start,t.category,s.title AS source_title
    FROM topics t JOIN source_sections s ON s.id=t.source_section_id
    WHERE (t.title ~* $1 OR t.content ~* $1)
    ORDER BY s.year DESC NULLS LAST,t.page_start ASC
    LIMIT $2
  `,[regex,Math.min(Math.max(limit,1),30)])).rows;
}
