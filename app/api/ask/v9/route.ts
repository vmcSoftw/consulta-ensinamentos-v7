import { NextRequest, NextResponse } from "next/server";
import { answerV9 } from "@/lib/v9-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const question = String(body?.question || "").trim();
    const result = await answerV9(question);

    const topicReferences = result.topics.map((topic) => ({
      topicId: topic.id,
      topicNumber: topic.topicNumber,
      title: topic.title,
      year: topic.year,
      sourceType: topic.sourceType,
      sourceTitle: topic.sourceTitle,
      page: topic.pageStart,
      pageEnd: topic.pageEnd,
      category: topic.category,
      keywords: topic.keywords,
      preview: topic.excerpt,
      contentLength: topic.contentLength,
      fullTopicAvailable: topic.contentLength > 0,
      fullTopicEndpoint: topic.fullTopicEndpoint,
      repeatedIn: [],
    }));

    const biblicalReferences = result.explicitBibleReferences.map((reference) => ({
      reference,
      mentions: 1,
      topicIds: [],
      verses: [],
    }));

    const bankMatch = result.bankCandidate
      ? {
          id: result.bankCandidate.id,
          question: result.bankCandidate.question,
          confidence: result.bankCandidate.score >= 0.9 ? "strong" : "possible",
          matchedQuery: result.question,
          matchedTerms: result.whySelected.interpretedTerms,
          coverage: result.bankCandidate.score,
          localScore: result.bankCandidate.score * 100,
          sourceCount: result.bankCandidate.sources.length,
          approved: result.bankCandidate.trusted,
        }
      : null;

    const strength =
      result.trust.documentaryBreadth === "ampla"
        ? "forte"
        : result.trust.documentaryBreadth === "moderada"
          ? "moderada"
          : result.trust.documentaryBreadth === "limitada"
            ? "limitada"
            : "sem fonte documental";

    const structuredResponse = {
      version: "v9.0",
      response: result.answer,
      bible: biblicalReferences,
      ccb: topicReferences.slice(0, 6),
      practicalGuidance: [],
      conclusion: "",
      referencesBible: result.explicitBibleReferences,
      referencesCcb: topicReferences.slice(0, 10),
      origin: result.answerOrigin,
    };

    return NextResponse.json({
      version: result.version,
      question: result.question,
      answer: result.answer,
      naturalAnswer: result.answer,
      detailedAnswer: result.bankCandidate?.trusted ? result.answer : "",
      structuredResponse,
      documentaryStrength: strength,
      documentaryNote: result.trust.note,
      sourceCount: topicReferences.length,
      fullTopicCount: topicReferences.length,
      searchedTotal: result.whySelected.candidateCount,
      fromQuestionBank: result.trust.bankTrusted,
      bankChecked: true,
      bankSearchQueries: [result.question],
      bankCandidatesChecked: result.bankCandidate ? 1 : 0,
      bankMatch,
      bankApprovedMatch: result.trust.bankTrusted,
      focusQuery: result.question,
      focusTerms: result.whySelected.interpretedTerms,
      subjectFilterApplied: true,
      subjectMatchedTopicCount: topicReferences.length,
      answerEngine: result.engine,
      answerOrigin: result.answerOrigin,
      interpretedTerms: result.whySelected.interpretedTerms,
      bibleSummary: result.explicitBibleReferences,
      biblicalReferences,
      answerSections: [],
      topicReferences,
      specificGuidance: [],
      documentarySources: topicReferences.map((topic) => ({
        id: `topic-${topic.topicId}`,
        topicId: topic.topicId,
        title: topic.sourceTitle || topic.title,
        sourceType: topic.sourceType,
        year: topic.year,
        page: topic.page,
        pageEnd: topic.pageEnd,
        citationText: topic.preview,
      })),
      groupedRepeatCount: 0,
      explicitBibleReferencesOnly: true,
      trust: result.trust,
      whySelected: result.whySelected,
      diagnostics: result.diagnostics,
      bankCandidate: result.bankCandidate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar o acervo.";
    const status = /Digite|longa/.test(message) ? 400 : 500;
    console.error("Erro em /api/ask/v9:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
