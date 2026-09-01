import fs from "node:fs";
import path from "node:path";
import pg from "pg";
const { Client } = pg;

function loadEnv(){
  const p=path.resolve(".env.local");
  if(!fs.existsSync(p)) return;
  for(const raw of fs.readFileSync(p,"utf8").split(/\r?\n/)){
    const l=raw.trim(); if(!l||l.startsWith("#")) continue;
    const i=l.indexOf("="); if(i<1) continue;
    const k=l.slice(0,i).trim(); let v=l.slice(i+1).trim();
    if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
    if(!process.env[k]) process.env[k]=v;
  }
}
function qi(s){return '"' + String(s).replaceAll('"','""') + '"';}
loadEnv();
if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL não encontrada.");

const src=JSON.parse(fs.readFileSync(path.resolve("data","biblia-arc2009-auditada.json"),"utf8"));
if(src.source.books!==66||src.source.chapters!==1189||src.source.verses!==31105) throw new Error("Fonte auditada inválida.");

const c=new Client({connectionString:process.env.DATABASE_URL});
await c.connect();
const stamp=new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14);
const backup=`bible_verses_backup_before_final_audit_${stamp}`;

try{
  const before=await c.query(`
    SELECT count(*)::int verses,
           count(DISTINCT book_order)::int books,
           count(DISTINCT (book_order,chapter))::int chapters
    FROM public.bible_verses
  `);
  if(before.rows[0].verses!==31105||before.rows[0].books!==66||before.rows[0].chapters!==1189){
    throw new Error("A estrutura atual do banco difere do esperado. Nenhuma alteração foi feita.");
  }

  console.log("Criando backup completo:",backup);
  await c.query("BEGIN");
  await c.query(`CREATE TABLE ${qi(backup)} AS TABLE public.bible_verses WITH DATA`);
  await c.query(`
    CREATE TEMP TABLE bible_final_stage(
      book_order integer NOT NULL,
      chapter integer NOT NULL,
      verse integer NOT NULL,
      text text NOT NULL,
      pdf_page integer,
      PRIMARY KEY(book_order,chapter,verse)
    ) ON COMMIT DROP
  `);

  const batchSize=500;
  for(let start=0;start<src.verses.length;start+=batchSize){
    const batch=src.verses.slice(start,start+batchSize);
    const vals=[]; const rows=[];
    for(const v of batch){
      const base=vals.length;
      vals.push(v.book_order,v.chapter,v.verse,v.text,v.pdf_page);
      rows.push(`($${base+1},$${base+2},$${base+3},$${base+4},$${base+5})`);
    }
    await c.query(
      `INSERT INTO bible_final_stage(book_order,chapter,verse,text,pdf_page) VALUES ${rows.join(",")}`,
      vals
    );
    process.stdout.write(`\rFonte preparada ${Math.min(start+batch.length,src.verses.length)} / ${src.verses.length}`);
  }
  process.stdout.write("\n");

  const unmatched=await c.query(`
    SELECT
      (SELECT count(*) FROM bible_final_stage s LEFT JOIN public.bible_verses b USING(book_order,chapter,verse) WHERE b.id IS NULL)::int missing_in_db,
      (SELECT count(*) FROM public.bible_verses b LEFT JOIN bible_final_stage s USING(book_order,chapter,verse) WHERE s.book_order IS NULL)::int extra_in_db
  `);
  if(unmatched.rows[0].missing_in_db!==0||unmatched.rows[0].extra_in_db!==0){
    throw new Error("As chaves da Bíblia não correspondem 100% à fonte auditada.");
  }

  const diff=await c.query(`
    SELECT count(*)::int verses,
           count(DISTINCT (b.book_order,b.chapter))::int chapters
    FROM public.bible_verses b
    JOIN bible_final_stage s USING(book_order,chapter,verse)
    WHERE b.text IS DISTINCT FROM s.text OR b.pdf_page IS DISTINCT FROM s.pdf_page
  `);
  console.log("Versículos a corrigir:",diff.rows[0].verses);
  console.log("Capítulos afetados:",diff.rows[0].chapters);

  await c.query(`
    UPDATE public.bible_verses b
       SET text=s.text,pdf_page=s.pdf_page
      FROM bible_final_stage s
     WHERE b.book_order=s.book_order
       AND b.chapter=s.chapter
       AND b.verse=s.verse
       AND (b.text IS DISTINCT FROM s.text OR b.pdf_page IS DISTINCT FROM s.pdf_page)
  `);

  const residual=await c.query(`
    SELECT count(*)::int total
    FROM public.bible_verses b
    JOIN bible_final_stage s USING(book_order,chapter,verse)
    WHERE b.text IS DISTINCT FROM s.text OR b.pdf_page IS DISTINCT FROM s.pdf_page
  `);
  if(residual.rows[0].total!==0) throw new Error("Ainda existem divergências após a atualização.");

  const final=await c.query(`
    SELECT count(*)::int verses,
           count(DISTINCT book_order)::int books,
           count(DISTINCT (book_order,chapter))::int chapters,
           count(*) FILTER(WHERE text IS NULL OR btrim(text)='')::int empty
    FROM public.bible_verses
  `);
  if(final.rows[0].verses!==31105||final.rows[0].books!==66||final.rows[0].chapters!==1189||final.rows[0].empty!==0){
    throw new Error("Validação estrutural final falhou.");
  }

  const gaps=await c.query(`
    SELECT count(*)::int bad_chapters
    FROM (
      SELECT book_order,chapter,min(verse) mn,max(verse) mx,count(*) ct,count(DISTINCT verse) dct
      FROM public.bible_verses
      GROUP BY book_order,chapter
      HAVING min(verse)<>1 OR count(*)<>max(verse) OR count(DISTINCT verse)<>count(*)
    ) q
  `);
  if(gaps.rows[0].bad_chapters!==0) throw new Error("Há capítulos com numeração de versículos incompleta.");

  const checks=await c.query(`
    SELECT book_order,chapter,verse,text
    FROM public.bible_verses
    WHERE (book_order=43 AND chapter=3 AND verse IN(21,36))
    ORDER BY verse
  `);
  const expected21="Mas quem pratica a verdade vem para a luz, a fim de que as suas obras sejam manifestas, porque são feitas em Deus.";
  const expected36="Aquele que crê no Filho tem a vida eterna, mas aquele que não crê no Filho não verá a vida, mas a ira de Deus sobre ele permanece.";
  if(checks.rows.find(x=>x.verse===21)?.text!==expected21 || checks.rows.find(x=>x.verse===36)?.text!==expected36){
    throw new Error("Checkpoints João 3:21/36 falharam.");
  }

  await c.query("COMMIT");
  await c.query("ANALYZE public.bible_verses");

  const report={
    generated_at:new Date().toISOString(),
    corrected_verses:diff.rows[0].verses,
    affected_chapters:diff.rows[0].chapters,
    final_structure:final.rows[0],
    bad_chapters_after:0,
    remaining_differences:0,
    backup_table:backup,
    checkpoints:checks.rows
  };
  fs.writeFileSync("AUDITORIA-BANCO-BIBLIA-DEPOIS.json",JSON.stringify(report,null,2),"utf8");

  console.log("\nCORREÇÃO GERAL CONCLUÍDA");
  console.log("-------------------------");
  console.log("Estrutura:",final.rows[0]);
  console.log("Capítulos com falha de sequência: 0");
  console.log("Divergências restantes da fonte: 0");
  console.log("Backup preservado:",backup);
  console.log("Relatório: AUDITORIA-BANCO-BIBLIA-DEPOIS.json");
}catch(e){
  try{await c.query("ROLLBACK");}catch{}
  console.error("\nFalha. A transação foi revertida.");
  console.error(e?.stack||e);
  process.exitCode=1;
}finally{
  await c.end();
}
