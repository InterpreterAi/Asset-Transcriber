import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { db } from "@workspace/db";
import { glossaryEntriesTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  isWorkspaceLanguageCode,
  normalizeWorkspaceLanguageCode,
} from "../lib/workspace-languages.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const entries = await db
    .select()
    .from(glossaryEntriesTable)
    .where(eq(glossaryEntriesTable.userId, userId))
    .orderBy(desc(glossaryEntriesTable.priority), glossaryEntriesTable.createdAt);
  res.json({ entries });
});

router.post("/", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const body = req.body as {
    term?: string;
    translation?: string;
    enforceMode?: string;
    priority?: unknown;
    sourceLanguage?: string;
    targetLanguage?: string;
  };
  const { term, translation } = body;
  if (!term?.trim() || !translation?.trim()) {
    res.status(400).json({ error: "term and translation are required" });
    return;
  }
  const rawSrc = `${body.sourceLanguage ?? ""}`.trim();
  const rawTgt = `${body.targetLanguage ?? ""}`.trim();
  if (!rawSrc || !rawTgt) {
    res.status(400).json({ error: "sourceLanguage and targetLanguage are required" });
    return;
  }
  if (!isWorkspaceLanguageCode(rawSrc) || !isWorkspaceLanguageCode(rawTgt)) {
    res.status(400).json({ error: "sourceLanguage and targetLanguage must be workspace language codes" });
    return;
  }
  const sourceLanguage = normalizeWorkspaceLanguageCode(rawSrc);
  const targetLanguage = normalizeWorkspaceLanguageCode(rawTgt);
  if (sourceLanguage === targetLanguage) {
    res.status(400).json({ error: "sourceLanguage and targetLanguage must differ" });
    return;
  }
  const enforceMode = body.enforceMode === "hint" ? "hint" : "strict";
  let priority = 0;
  const rawPri = body.priority;
  if (typeof rawPri === "number" && Number.isFinite(rawPri)) {
    priority = Math.max(-10_000, Math.min(10_000, Math.trunc(rawPri)));
  } else if (typeof rawPri === "string" && rawPri.trim() !== "") {
    const n = parseInt(rawPri, 10);
    if (Number.isFinite(n)) priority = Math.max(-10_000, Math.min(10_000, n));
  }
  const [entry] = await db
    .insert(glossaryEntriesTable)
    .values({
      userId,
      term: term.trim(),
      translation: translation.trim(),
      sourceLanguage,
      targetLanguage,
      enforceMode,
      priority,
    })
    .onConflictDoUpdate({
      target: [glossaryEntriesTable.userId, glossaryEntriesTable.term],
      set: {
        translation: translation.trim(),
        sourceLanguage,
        targetLanguage,
        enforceMode,
        priority,
      },
    })
    .returning();
  res.status(201).json({ entry });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(String(req.params.id ?? "0"), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(glossaryEntriesTable)
    .where(and(eq(glossaryEntriesTable.id, id), eq(glossaryEntriesTable.userId, userId)));
  res.json({ ok: true });
});

export default router;
