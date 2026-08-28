import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';
import { ROOT, requireDatabaseUrl } from '../lib/env.mjs';

const { Pool } = pg;

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const GROUPS = {
  casamento: ['casamento','matrimônio','cônjuge','esposo','esposa','divórcio','separação','adultério','infidelidade','infidelidade conjugal','novas núpcias'],
  batismo: ['batismo','batizar','batizados','imersão','águas','tanque de batismo'],
  veu: ['véu','cabeça coberta','cabelos','cabelo crescido','cabeça descoberta'],
  oracao: ['oração','orar','orações','clamor','ajoelhar'],
  jejum: ['jejum','jejuar'],
  mocidade: ['mocidade','jovens','menores','juventude','reunião de jovens e menores'],
  musica: ['música','hinos','orquestra','músicos','organistas','instrumentos','encarregados de orquestra'],
  santa_ceia: ['santa ceia','ceia','pão','cálice'],
  ministerio: ['ministério','ancião','anciães','diácono','diáconos','cooperador','cooperadores'],
  culto: ['culto','cultos','serviço divino','serviços divinos','testemunho','exortação','palavra'],
  familia: ['família','pais','filhos','pai','mãe','convivência'],
  enfermidade: ['enfermidade','enfermo','doença','doente','unção','médicos','remédios'],
  salvacao: ['salvação','graça','redenção','regeneração','novo nascimento'],
  espirito_santo: ['espírito santo','dom do espírito santo','promessa do espírito santo','novas línguas'],
  doutrina: ['doutrina','fé','pontos de doutrina','heresia','fundamento da fé'],
  vestuario: ['vestuário','trajes','modéstia','roupas'],
  funeral: ['funeral','funerais','sepultamento','falecimento'],
  politica: ['política','eleição','voto','candidato'],
  oferta: ['oferta','ofertas','coleta','coletas'],
  internet: ['internet','rede social','redes sociais','vídeos','áudios']
};

const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 3 });
const client = await pool.connect();

async function insertSources(sources) {
  for (const s of sources) {
    await client.query(
      `INSERT INTO source_sections(id, document_id, year, source_type, title, page_start, page_end, source_order)
       VALUES($1,1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         year=EXCLUDED.year,
         source_type=EXCLUDED.source_type,
         title=EXCLUDED.title,
         page_start=EXCLUDED.page_start,
         page_end=EXCLUDED.page_end,
         source_order=EXCLUDED.source_order`,
      [s.source_id, s.year, s.source_type, s.title, s.start_page, s.end_page, s.source_id]
    );
  }
}

async function insertTopics(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;
  let batch = [];

  async function flush() {
    if (!batch.length) return;
    const values = [];
    const params = [];
    let p = 1;
    for (const t of batch) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(t.id, t.source_id, t.topic_number, t.title, t.content, t.page_start, t.page_end, t.category, t.keywords || []);
    }
    await client.query(
      `INSERT INTO topics(id, source_section_id, topic_number, title, content, page_start, page_end, category, keywords)
       VALUES ${values.join(',')}
       ON CONFLICT (id) DO UPDATE SET
         source_section_id=EXCLUDED.source_section_id,
         topic_number=EXCLUDED.topic_number,
         title=EXCLUDED.title,
         content=EXCLUDED.content,
         page_start=EXCLUDED.page_start,
         page_end=EXCLUDED.page_end,
         category=EXCLUDED.category,
         keywords=EXCLUDED.keywords`,
      params
    );
    count += batch.length;
    process.stdout.write(`\rTópicos processados: ${count}`);
    batch = [];
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    if (batch.length >= 40) await flush();
  }
  await flush();
  process.stdout.write('\n');
  return count;
}

async function insertSynonyms() {
  const pairs = new Map();
  for (const terms of Object.values(GROUPS)) {
    for (const source of terms) {
      for (const target of terms) {
        pairs.set(`${normalize(source)}\u0000${target}`, [normalize(source), target]);
      }
    }
  }

  const rows = [...pairs.values()];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const values = [];
    const params = [];
    let p = 1;
    for (const [term, related] of chunk) {
      values.push(`($${p++},$${p++})`);
      params.push(term, related);
    }
    await client.query(
      `INSERT INTO search_synonyms(term, related_term)
       VALUES ${values.join(',')}
       ON CONFLICT (term, related_term) DO NOTHING`,
      params
    );
  }
}

try {
  const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sources.json'), 'utf8'));
  const topicsPath = path.join(ROOT, 'data', 'topics.jsonl');

  console.log('Importando o acervo para o Neon...');
  await client.query('BEGIN');

  await client.query(
    `INSERT INTO documents(id, title, file_name, description)
     VALUES(1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       title=EXCLUDED.title,
       file_name=EXCLUDED.file_name,
       description=EXCLUDED.description`,
    ['Tópicos de Ensinamentos e Doutrina para Irmandade', 'documento.pdf', 'Acervo histórico utilizado pela aplicação Consulta de Ensinamentos.']
  );

  await insertSources(sources);
  const totalTopics = await insertTopics(topicsPath);
  await insertSynonyms();

  await client.query(`SELECT setval(pg_get_serial_sequence('documents','id'), GREATEST((SELECT max(id) FROM documents),1), true)`);
  await client.query(`SELECT setval(pg_get_serial_sequence('source_sections','id'), GREATEST((SELECT max(id) FROM source_sections),1), true)`);
  await client.query(`SELECT setval(pg_get_serial_sequence('topics','id'), GREATEST((SELECT max(id) FROM topics),1), true)`);
  await client.query(`SELECT setval(pg_get_serial_sequence('search_synonyms','id'), GREATEST((SELECT max(id) FROM search_synonyms),1), true)`);

  await client.query('COMMIT');
  console.log(`Importação concluída: ${totalTopics} tópicos processados.`);
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Falha na importação. A transação foi cancelada.');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
