import { NextRequest, NextResponse } from "next/server";
import { findApprovedQuestion, normalizeQuestion, questionBankDb } from "../../../lib/question-bank";

export const dynamic = "force-dynamic";

async function requireAdmin(request: NextRequest) {
  try {
    const r = await fetch(`${request.nextUrl.origin}/api/admin/session`, {
      headers: { cookie: request.headers.get("cookie") || "" },
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({}));
    return !!data?.authenticated;
  } catch {
    return false;
  }
}

function makeShort(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 420) return clean;
  const cut = clean.slice(0, 420);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (stop > 120 ? cut.slice(0, stop + 1) : cut + "…").trim();
}

function parsePairs(raw: string) {
  const lines = raw.replace(/\r/g, "").split("\n").map((x) => x.replace(/[ \t]+/g, " ").trim());
  const out: Array<{question:string; shortAnswer:string; fullAnswer:string}> = [];
  let cur: {question:string; short:string[]; full:string[]; mode:"short"|"full"} | null = null;
  const finish = () => {
    if (!cur?.question) return;
    let shortAnswer = cur.short.join("\n").trim();
    let fullAnswer = cur.full.join("\n").trim();
    if (!shortAnswer && fullAnswer) shortAnswer = makeShort(fullAnswer);
    if (!fullAnswer && shortAnswer) fullAnswer = shortAnswer;
    out.push({ question: cur.question.trim(), shortAnswer, fullAnswer });
    cur = null;
  };

  for (const line of lines) {
    if (!line) continue;
    const q = line.match(/^(?:\d{1,4}\s*[.)-]?\s*)?(?:PERGUNTA|QUEST[ÃA]O)\s*[:\-–—]\s*(.+)$/i);
    if (q) { finish(); cur = { question:q[1].trim(), short:[], full:[], mode:"full" }; continue; }
    const s = line.match(/^(?:RESPOSTA\s+)?(?:SIMPLIFICADA|CURTA|BREVE)\s*[:\-–—]\s*(.*)$/i);
    if (s && cur) { cur.mode="short"; if (s[1]) cur.short.push(s[1]); continue; }
    const f = line.match(/^(?:RESPOSTA\s+)?(?:AMPLA|COMPLETA|DETALHADA)\s*[:\-–—]\s*(.*)$/i);
    if (f && cur) { cur.mode="full"; if (f[1]) cur.full.push(f[1]); continue; }
    const r = line.match(/^(?:RESPOSTA|R)\s*[:\-–—]\s*(.*)$/i);
    if (r && cur) { cur.mode="full"; if (r[1]) cur.full.push(r[1]); continue; }
    const nq = line.match(/^(?:\d{1,4}\s*[.)-]\s*)(.+\?)$/);
    if ((nq || line.endsWith("?")) && (!cur || cur.short.length || cur.full.length)) {
      finish(); cur = { question:(nq?.[1] || line).trim(), short:[], full:[], mode:"full" }; continue;
    }
    if (cur) cur[cur.mode].push(line);
  }
  finish();
  return out.filter((x) => x.question.length >= 3).slice(0, 300);
}

function trigrams(text: string) {
  const v = `  ${text} `; const s = new Set<string>();
  for (let i=0;i<=v.length-3;i++) s.add(v.slice(i,i+3));
  return s;
}
function sim(a:string,b:string) {
  if (a===b) return 1; const A=trigrams(a), B=trigrams(b); if(!A.size||!B.size)return 0;
  let n=0; for(const t of A) if(B.has(t)) n++; return (2*n)/(A.size+B.size);
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Acesso restrito ao Banco de Perguntas." }, { status: 401 });
  }

  try {
    const sql = questionBankDb();
    const id = Number(request.nextUrl.searchParams.get("id") || 0);
    if (id) {
      const rows = await sql`
        SELECT q.id, q.canonical_question, q.default_answer_mode,
               a.short_answer, a.full_answer, a.version
        FROM public.question_bank_questions q
        JOIN LATERAL (
          SELECT short_answer, full_answer, version
          FROM public.question_bank_answers
          WHERE question_id=q.id AND status='approved'
          ORDER BY version DESC, id DESC LIMIT 1
        ) a ON true
        WHERE q.id=${id} AND q.status='approved' LIMIT 1
      `;
      if (!rows.length) return NextResponse.json({error:"Pergunta não encontrada."},{status:404});
      const aliases = await sql`SELECT alias FROM public.question_bank_aliases WHERE question_id=${id} ORDER BY alias`;
      const sources = await sql`SELECT id, topic_id, source_title, source_type, source_year, page_start, page_end, citation_text FROM public.question_bank_sources WHERE question_id=${id} ORDER BY source_year NULLS LAST, page_start NULLS LAST`;
      return NextResponse.json({
        id:Number(rows[0].id), question:String(rows[0].canonical_question),
        shortAnswer:String(rows[0].short_answer||rows[0].full_answer||""),
        fullAnswer:String(rows[0].full_answer||rows[0].short_answer||""),
        defaultAnswerMode:String(rows[0].default_answer_mode||"short"), version:Number(rows[0].version||1),
        aliases:aliases.map((x)=>String(x.alias)),
        sources:sources.map((x)=>({id:Number(x.id),topicId:x.topic_id==null?null:Number(x.topic_id),sourceTitle:x.source_title||null,sourceType:x.source_type||null,sourceYear:x.source_year==null?null:Number(x.source_year),pageStart:x.page_start==null?null:Number(x.page_start),pageEnd:x.page_end==null?null:Number(x.page_end),citationText:x.citation_text||null}))
      });
    }

    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    const n = normalizeQuestion(q);
    const rows = await sql`
      SELECT q.id, q.canonical_question, a.short_answer, a.full_answer,
        CASE WHEN ${n}='' THEN 0.0 ELSE GREATEST(
          CASE WHEN q.normalized_question=${n} THEN 1.0 ELSE 0.0 END,
          similarity(q.normalized_question,${n}),
          COALESCE((SELECT MAX(similarity(x.normalized_alias,${n})) FROM public.question_bank_aliases x WHERE x.question_id=q.id),0.0)
        ) END AS score,
        (SELECT count(*)::int FROM public.question_bank_sources s WHERE s.question_id=q.id) AS source_count
      FROM public.question_bank_questions q
      JOIN LATERAL (
        SELECT short_answer, full_answer FROM public.question_bank_answers
        WHERE question_id=q.id AND status='approved' ORDER BY version DESC,id DESC LIMIT 1
      ) a ON true
      WHERE q.status='approved' AND (${n}='' OR q.normalized_question LIKE ${"%"+n+"%"} OR similarity(q.normalized_question,${n})>=0.25 OR EXISTS(SELECT 1 FROM public.question_bank_aliases x WHERE x.question_id=q.id AND (x.normalized_alias LIKE ${"%"+n+"%"} OR similarity(x.normalized_alias,${n})>=0.25)))
      ORDER BY score DESC, q.published_at DESC NULLS LAST, q.updated_at DESC LIMIT 60
    `;
    return NextResponse.json({query:q,total:rows.length,items:rows.map((x)=>({id:Number(x.id),question:String(x.canonical_question),shortAnswer:String(x.short_answer||x.full_answer||""),fullAnswer:String(x.full_answer||x.short_answer||""),score:Number(x.score||0),sourceCount:Number(x.source_count||0)}))});
  } catch (e) {
    console.error("Banco de Perguntas GET:",e);
    return NextResponse.json({error:"Não foi possível consultar o Banco de Perguntas."},{status:500});
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(()=>({}));
    const action = String(body?.action || "submit");
    const sql = questionBankDb();

    if (action === "submit") {
      const question = String(body?.question||"").trim();
      if (question.length<3) return NextResponse.json({error:"Pergunta inválida."},{status:400});
      const existing = await findApprovedQuestion(question,0.90);
      if (existing) return NextResponse.json({ok:true,alreadyExists:true,questionId:existing.id,message:"Esta pergunta já existe no Banco de Perguntas."});
      const rows = await sql`INSERT INTO public.question_bank_submissions(question,normalized_question,proposed_short_answer,proposed_full_answer,evidence,status,metadata) VALUES(${question},${normalizeQuestion(question)},${String(body?.shortAnswer||body?.answer||"")||null},${String(body?.fullAnswer||body?.answer||"")||null},${JSON.stringify(Array.isArray(body?.evidence)?body.evidence:[])}::jsonb,'review',${JSON.stringify({submittedByChoice:true})}::jsonb) RETURNING id`;
      return NextResponse.json({ok:true,submissionId:Number(rows[0].id),message:"Pergunta enviada para revisão do Banco de Perguntas."});
    }

    if (!(await requireAdmin(request))) return NextResponse.json({error:"Sessão administrativa necessária."},{status:401});

    if (action === "admin-list") {
      const rows = await sql`SELECT q.id,q.canonical_question,q.status,q.origin,q.updated_at,a.short_answer,a.full_answer,a.version,(SELECT count(*)::int FROM public.question_bank_sources s WHERE s.question_id=q.id) source_count FROM public.question_bank_questions q LEFT JOIN LATERAL(SELECT short_answer,full_answer,version FROM public.question_bank_answers WHERE question_id=q.id ORDER BY version DESC,id DESC LIMIT 1)a ON true ORDER BY q.updated_at DESC LIMIT 200`;
      const c = await sql`SELECT count(*)::int total,count(*) FILTER(WHERE status='approved')::int approved,count(*) FILTER(WHERE status='review')::int review,count(*) FILTER(WHERE status='draft')::int draft FROM public.question_bank_questions`;
      return NextResponse.json({items:rows.map((x)=>({id:Number(x.id),question:String(x.canonical_question),status:String(x.status),origin:String(x.origin),shortAnswer:String(x.short_answer||""),fullAnswer:String(x.full_answer||""),version:Number(x.version||0),sourceCount:Number(x.source_count||0)})),counts:c[0]||{}});
    }

    if (action === "create") {
      const question=String(body?.question||"").trim(), shortAnswer=String(body?.shortAnswer||"").trim(), fullAnswer=String(body?.fullAnswer||"").trim();
      if(question.length<3||(!shortAnswer&&!fullAnswer)) return NextResponse.json({error:"Informe pergunta e resposta."},{status:400});
      const status=["draft","review","approved"].includes(String(body?.status))?String(body.status):"approved";
      const n=normalizeQuestion(question);
      const d=await sql`SELECT id,canonical_question,GREATEST(CASE WHEN normalized_question=${n} THEN 1.0 ELSE 0.0 END,similarity(normalized_question,${n})) score FROM public.question_bank_questions WHERE status<>'archived' ORDER BY score DESC LIMIT 1`;
      if(d.length&&Number(d[0].score||0)>=0.90&&!body?.force) return NextResponse.json({error:"Pergunta igual ou muito semelhante já cadastrada.",duplicate:{id:Number(d[0].id),question:String(d[0].canonical_question),score:Number(d[0].score)}},{status:409});
      const qr=await sql`INSERT INTO public.question_bank_questions(canonical_question,normalized_question,status,origin,default_answer_mode,published_at,metadata) VALUES(${question},${n},${status},'manual','short',${status==='approved'?new Date().toISOString():null},'{}'::jsonb) RETURNING id`;
      const qid=Number(qr[0].id);
      await sql`INSERT INTO public.question_bank_answers(question_id,short_answer,full_answer,status,version,metadata) VALUES(${qid},${shortAnswer||fullAnswer},${fullAnswer||shortAnswer},${status},1,'{}'::jsonb)`;
      for(const raw of (Array.isArray(body?.aliases)?body.aliases:[]).slice(0,30)){const a=String(raw).trim(),an=normalizeQuestion(a);if(a&&an&&an!==n)await sql`INSERT INTO public.question_bank_aliases(question_id,alias,normalized_alias) VALUES(${qid},${a},${an}) ON CONFLICT(question_id,normalized_alias) DO NOTHING`;}
      return NextResponse.json({ok:true,id:qid,status});
    }

    if (action === "status") {
      const id=Number(body?.id), status=String(body?.status||"");
      if(!id||!["draft","review","approved","archived"].includes(status)) return NextResponse.json({error:"Dados inválidos."},{status:400});
      await sql`UPDATE public.question_bank_questions SET status=${status},published_at=CASE WHEN ${status}='approved' THEN COALESCE(published_at,now()) ELSE published_at END,updated_at=now() WHERE id=${id}`;
      const v=await sql`SELECT short_answer,full_answer,COALESCE(MAX(version),0)::int version FROM public.question_bank_answers WHERE question_id=${id} GROUP BY short_answer,full_answer ORDER BY version DESC LIMIT 1`;
      if(v.length) await sql`INSERT INTO public.question_bank_answers(question_id,short_answer,full_answer,status,version,metadata) VALUES(${id},${v[0].short_answer||v[0].full_answer},${v[0].full_answer||v[0].short_answer},${status},${Number(v[0].version||0)+1},'{}'::jsonb)`;
      return NextResponse.json({ok:true});
    }

    if (action === "review-list") {
      const rows=await sql`SELECT id,question,proposed_short_answer,proposed_full_answer,evidence,created_at FROM public.question_bank_submissions WHERE status='review' ORDER BY created_at DESC LIMIT 100`;
      return NextResponse.json({items:rows.map((x)=>({id:Number(x.id),question:String(x.question),shortAnswer:String(x.proposed_short_answer||""),fullAnswer:String(x.proposed_full_answer||""),evidence:Array.isArray(x.evidence)?x.evidence:[],createdAt:x.created_at}))});
    }

    if (action === "review") {
      const id=Number(body?.id), decision=String(body?.decision||"");
      const rows=await sql`SELECT * FROM public.question_bank_submissions WHERE id=${id} AND status='review' LIMIT 1`;
      if(!rows.length) return NextResponse.json({error:"Sugestão não encontrada."},{status:404});
      if(decision==='reject'){await sql`UPDATE public.question_bank_submissions SET status='rejected',reviewed_at=now() WHERE id=${id}`;return NextResponse.json({ok:true,status:"rejected"});}
      if(decision!=='approve') return NextResponse.json({error:"Decisão inválida."},{status:400});
      const q=String(rows[0].question),n=normalizeQuestion(q);const d=await sql`SELECT id,GREATEST(CASE WHEN normalized_question=${n} THEN 1.0 ELSE 0.0 END,similarity(normalized_question,${n})) score FROM public.question_bank_questions WHERE status<>'archived' ORDER BY score DESC LIMIT 1`;
      if(d.length&&Number(d[0].score||0)>=0.90){await sql`UPDATE public.question_bank_submissions SET status='merged',reviewed_at=now(),metadata=metadata||${JSON.stringify({mergedIntoQuestionId:Number(d[0].id)})}::jsonb WHERE id=${id}`;return NextResponse.json({ok:true,status:"merged",questionId:Number(d[0].id)});}
      const qr=await sql`INSERT INTO public.question_bank_questions(canonical_question,normalized_question,status,origin,default_answer_mode,published_at,metadata) VALUES(${q},${n},'approved','user','short',now(),${JSON.stringify({submissionId:id})}::jsonb) RETURNING id`;const qid=Number(qr[0].id);
      const sa=String(body?.shortAnswer??rows[0].proposed_short_answer??rows[0].proposed_full_answer??""),fa=String(body?.fullAnswer??rows[0].proposed_full_answer??rows[0].proposed_short_answer??"");
      await sql`INSERT INTO public.question_bank_answers(question_id,short_answer,full_answer,status,version,metadata) VALUES(${qid},${sa||fa},${fa||sa},'approved',1,${JSON.stringify({submissionId:id})}::jsonb)`;
      const ev=Array.isArray(rows[0].evidence)?rows[0].evidence:[];for(const x of ev.slice(0,30))await sql`INSERT INTO public.question_bank_sources(question_id,topic_id,source_title,source_type,source_year,page_start,citation_text,metadata) VALUES(${qid},${x?.topicId?Number(x.topicId):null},${x?.sourceTitle?String(x.sourceTitle):null},${x?.sourceType?String(x.sourceType):null},${x?.year?Number(x.year):null},${x?.page?Number(x.page):null},${x?.text?String(x.text).slice(0,1200):null},'{}'::jsonb)`;
      await sql`UPDATE public.question_bank_submissions SET status='approved',reviewed_at=now() WHERE id=${id}`;return NextResponse.json({ok:true,status:"approved",questionId:qid});
    }

    if (action === "import-preview") {
      const filename=String(body?.filename||"arquivo"),fileType=["pdf","docx","txt"].includes(String(body?.fileType))?String(body.fileType):"other",text=String(body?.text||"").trim();
      if(text.length<5)return NextResponse.json({error:"Arquivo sem texto suficiente."},{status:400});
      const pairs=parsePairs(text);if(!pairs.length)return NextResponse.json({error:"Nenhum par pergunta/resposta identificado. Use PERGUNTA: e RESPOSTA: ou perguntas terminadas em ?."},{status:422});
      const existing=await sql`SELECT id,canonical_question,normalized_question FROM public.question_bank_questions WHERE status<>'archived' LIMIT 10000`;
      const prepared=pairs.map((p)=>{const n=normalizeQuestion(p.question);let best:any=null;for(const e of existing){const score=sim(n,String(e.normalized_question));if(!best||score>best.score)best={id:Number(e.id),question:String(e.canonical_question),score};}let status="ready";if(best?.score===1)status="duplicate";else if((best?.score||0)>=0.78||(!p.shortAnswer&&!p.fullAnswer))status="review";return {...p,normalizedQuestion:n,status,duplicateQuestionId:status==='ready'?null:best?.id||null,duplicateQuestion:status==='ready'?null:best?.question||null,duplicateScore:status==='ready'?0:Number((best?.score||0).toFixed(3))};});
      const ir=await sql`INSERT INTO public.question_bank_imports(filename,file_type,sha256,status,total_detected,duplicate_count,review_count,metadata) VALUES(${filename},${fileType},${String(body?.sha256||"")||null},'ready',${prepared.length},${prepared.filter(x=>x.status==='duplicate').length},${prepared.filter(x=>x.status==='review').length},${JSON.stringify({parserVersion:"qb-v1",textLength:text.length})}::jsonb) RETURNING id`;const iid=Number(ir[0].id);
      const items=[] as any[];for(const p of prepared){const rr=await sql`INSERT INTO public.question_bank_import_items(import_id,question,normalized_question,short_answer,full_answer,status,duplicate_question_id,metadata) VALUES(${iid},${p.question},${p.normalizedQuestion},${p.shortAnswer||null},${p.fullAnswer||null},${p.status},${p.duplicateQuestionId},${JSON.stringify({duplicateQuestion:p.duplicateQuestion,duplicateScore:p.duplicateScore})}::jsonb) RETURNING id`;items.push({...p,id:Number(rr[0].id),selected:p.status==='ready'});}return NextResponse.json({importId:iid,total:items.length,ready:items.filter(x=>x.status==='ready').length,review:items.filter(x=>x.status==='review').length,duplicates:items.filter(x=>x.status==='duplicate').length,items});
    }

    if (action === "import-commit") {
      const importId=Number(body?.importId),items=Array.isArray(body?.items)?body.items:[],status=body?.publishImmediately===false?'review':'approved';if(!importId||!items.length)return NextResponse.json({error:"Nenhum item selecionado."},{status:400});let created=0,skipped=0;
      for(const x of items.slice(0,300)){if(!x?.selected)continue;const q=String(x.question||"").trim(),sa=String(x.shortAnswer||"").trim(),fa=String(x.fullAnswer||"").trim();if(!q||(!sa&&!fa))continue;const n=normalizeQuestion(q);const d=await sql`SELECT id,GREATEST(CASE WHEN normalized_question=${n} THEN 1.0 ELSE 0.0 END,similarity(normalized_question,${n})) score FROM public.question_bank_questions WHERE status<>'archived' ORDER BY score DESC LIMIT 1`;if(d.length&&Number(d[0].score||0)>=0.90&&!x?.force){skipped++;continue;}const qr=await sql`INSERT INTO public.question_bank_questions(canonical_question,normalized_question,status,origin,default_answer_mode,published_at,metadata) VALUES(${q},${n},${status},'import','short',${status==='approved'?new Date().toISOString():null},${JSON.stringify({importId,importItemId:x.id||null})}::jsonb) RETURNING id`;const qid=Number(qr[0].id);await sql`INSERT INTO public.question_bank_answers(question_id,short_answer,full_answer,status,version,metadata) VALUES(${qid},${sa||fa},${fa||sa},${status},1,${JSON.stringify({importId})}::jsonb)`;if(x?.id)await sql`UPDATE public.question_bank_import_items SET status='imported' WHERE id=${Number(x.id)} AND import_id=${importId}`;created++;}
      await sql`UPDATE public.question_bank_imports SET status='imported',imported_count=${created},completed_at=now() WHERE id=${importId}`;return NextResponse.json({ok:true,created,skipped,status});
    }

    return NextResponse.json({error:"Ação não reconhecida."},{status:400});
  } catch (e) {
    console.error("Banco de Perguntas POST:",e);
    return NextResponse.json({error:"Não foi possível concluir a operação."},{status:500});
  }
}
