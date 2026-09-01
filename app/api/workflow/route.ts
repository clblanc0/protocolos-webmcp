import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { workflowDrafts } from '@/db/schema';
import { defaultWorkflowDraft, type WorkflowDraft, type WorkflowStage } from '@/lib/workflow-data';

function validStage(stage: unknown): stage is WorkflowStage {
  if (!stage || typeof stage !== 'object') return false;
  const value = stage as Partial<WorkflowStage>;
  return typeof value.id === 'string' && typeof value.name === 'string' && typeof value.window === 'string'
    && [value.visits, value.tasks, value.assessments, value.samples].every((count) => typeof count === 'number' && count >= 0)
    && Array.isArray(value.gates) && value.gates.every((gate) => ['tasks', 'assessments', 'samples'].includes(gate));
}

function validDraft(value: unknown): value is WorkflowDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<WorkflowDraft>;
  return draft.id === 'primary' && typeof draft.protocolCode === 'string' && draft.protocolCode.trim().length > 0
    && typeof draft.name === 'string' && draft.name.trim().length > 0
    && typeof draft.objective === 'string' && Array.isArray(draft.stages) && draft.stages.length >= 2
    && draft.stages.every(validStage) && new Set(draft.stages.map((stage) => stage.id)).size === draft.stages.length
    && (draft.status === 'draft' || draft.status === 'published') && typeof draft.version === 'number';
}

export async function GET() {
  const db = await getDb();
  const row = await db.select().from(workflowDrafts).where(eq(workflowDrafts.id, 'primary')).get();
  if (!row) return Response.json(defaultWorkflowDraft);
  return Response.json({
    id: 'primary',
    protocolCode: row.protocolCode,
    name: row.name,
    objective: row.objective,
    status: row.status,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    stages: JSON.parse(row.stagesJson),
  } satisfies WorkflowDraft);
}

export async function POST(request: Request) {
  const value: unknown = await request.json();
  if (!validDraft(value)) return Response.json({ error: 'Invalid workflow definition.' }, { status: 400 });

  const saved: WorkflowDraft = { ...value, updatedAt: new Date().toISOString() };
  const db = await getDb();
  await db.insert(workflowDrafts).values({
    id: saved.id,
    protocolCode: saved.protocolCode.trim().toUpperCase(),
    name: saved.name.trim(),
    objective: saved.objective.trim(),
    status: saved.status,
    version: saved.version,
    stagesJson: JSON.stringify(saved.stages),
    updatedAt: new Date(saved.updatedAt),
  }).onConflictDoUpdate({
    target: workflowDrafts.id,
    set: {
      protocolCode: saved.protocolCode.trim().toUpperCase(),
      name: saved.name.trim(),
      objective: saved.objective.trim(),
      status: saved.status,
      version: saved.version,
      stagesJson: JSON.stringify(saved.stages),
      updatedAt: new Date(saved.updatedAt),
    },
  });
  return Response.json(saved);
}
