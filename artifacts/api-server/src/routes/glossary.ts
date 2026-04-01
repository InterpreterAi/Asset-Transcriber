import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { db } from "@workspace/db";
import { glossaryEntriesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const entries = await db
    .select()
    .from(glossaryEntriesTable)
    .where(eq(glossaryEntriesTable.userId, userId))
    .orderBy(glossaryEntriesTable.createdAt);
  res.json({ entries });
});

router.post("/", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { term, translation } = req.body as { term?: string; translation?: string };
  if (!term?.trim() || !translation?.trim()) {
    res.status(400).json({ error: "term and translation are required" });
    return;
  }
  const [entry] = await db
    .insert(glossaryEntriesTable)
    .values({ userId, term: term.trim(), translation: translation.trim() })
    .onConflictDoUpdate({
      target: [glossaryEntriesTable.userId, glossaryEntriesTable.term],
      set: { translation: translation.trim() },
    })
    .returning();
  res.status(201).json({ entry });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id ?? "0", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(glossaryEntriesTable)
    .where(and(eq(glossaryEntriesTable.id, id), eq(glossaryEntriesTable.userId, userId)));
  res.json({ ok: true });
});

export default router;
