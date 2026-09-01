'use client';

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock3,
  FlaskConical,
  LayoutDashboard,
  Library,
  LockKeyhole,
  MessageSquareText,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Workflow,
  X,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initialParticipants, studyPortfolio, type Participant, type StudySummary } from '@/lib/study-data';
import { defaultWorkflowDraft, type WorkflowDraft, type WorkflowGate, type WorkflowStage } from '@/lib/workflow-data';

type View = 'overview' | 'studies' | 'participants' | 'participant' | 'protocol' | 'builder' | 'checklist';
type AssistantMessage = {
  id: number;
  role: 'agent' | 'user';
  text: string;
  meta?: string;
  actions?: ('checklist' | 'advance' | 'advance-stage' | 'assessments' | 'samples')[];
};
type ActivityEntry = {
  id: string;
  subjectId: Participant['id'];
  actor: 'Coordinator' | 'Agent';
  action: string;
  time: string;
};
type ToolRun = {
  id: string;
  tool: string;
  title: string;
  access: 'read' | 'write';
  status: 'completed' | 'blocked' | 'failed';
  subjectId?: string;
  summary: string;
  uiChanged: boolean;
  time: string;
};
type WebMcpStatus = 'checking' | 'connected' | 'unavailable';
type ModelContext = {
  registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<void>;
};

const participantSchema = {
  type: 'object',
  properties: {
    participant_id: { type: 'string', enum: ['SUB001', 'SUB002', 'SUB003'], description: 'Synthetic subject identifier.' },
  },
  required: ['participant_id'],
  additionalProperties: false,
};

const stageUpdateSchema = {
  type: 'object',
  properties: {
    stage_id: { type: 'string', description: 'Stage identifier from get_protocol_workflow.' },
    name: { type: 'string' },
    window: { type: 'string', description: 'Optional timing, cadence, or trigger for this stage.' },
    visits: { type: 'number', minimum: 0 },
    tasks: { type: 'number', minimum: 0 },
    assessments: { type: 'number', minimum: 0 },
    samples: { type: 'number', minimum: 0 },
    gates: { type: 'array', items: { type: 'string', enum: ['tasks', 'assessments', 'samples'] } },
  },
  required: ['stage_id'],
  additionalProperties: false,
};

const toolResult = (value: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
});

const summarizeToolOutcome = (tool: string, result: unknown) => {
  const value = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  if (tool === 'get_today_priorities') return `${Array.isArray(value.priorities) ? value.priorities.length : 0} subject priorities returned`;
  if (tool === 'get_study_portfolio') return `${Array.isArray(value.studies) ? value.studies.length : 0} studies compared`;
  if (tool === 'get_protocol_workflow') return 'Published operational workflow returned';
  if (tool === 'update_protocol_stage') return 'Workflow draft updated for review';
  if (tool === 'publish_protocol_workflow') return 'Workflow published to live operations';
  if (tool === 'create_visit_checklist') return `${value.participant_id ?? 'Subject'} checklist opened in the workspace`;
  if (tool === 'mark_task_complete') return `${value.task_title ?? value.task_id ?? 'Task'} marked complete`;
  if (tool === 'advance_study_phase') return String(value.decision ?? 'Stage readiness evaluated');
  if (value.participant_id) return `${value.participant_id} ${tool.replace(/^get_|^check_/, '').replaceAll('_', ' ')} returned`;
  return 'Structured result returned';
};

const formatCompletedActivity = (title: string) => {
  if (/^complete\s+/i.test(title)) return `Completed ${title.replace(/^complete\s+/i, '')}`;
  if (/^collect and route\s+/i.test(title)) return `Collected and routed ${title.replace(/^collect and route\s+/i, '')}`;
  if (/^collect\s+/i.test(title)) return `Collected ${title.replace(/^collect\s+/i, '')}`;
  if (/^confirm\s+/i.test(title)) return `Confirmed ${title.replace(/^confirm\s+/i, '')}`;
  return `Completed ${title}`;
};

const resolveWorkflowStage = (participant: Participant, workflow: WorkflowDraft) => {
  const phaseName = participant.phase.split('·')[0].trim().toLowerCase();
  return workflow.stages.find((stage) => stage.name.trim().toLowerCase() === phaseName) ?? workflow.stages[0];
};

const getOperationalContext = (participant: Participant, workflow: WorkflowDraft) => {
  const stage = resolveWorkflowStage(participant, workflow);
  const remaining = {
    tasks: participant.tasks.filter((task) => task.required && !task.completed).length,
    assessments: participant.assessments.filter((item) => item.required && item.status !== 'Complete').length,
    samples: participant.samples.filter((item) => item.status === 'Due').length,
  };
  const gates = stage.gates.length ? stage.gates : ['tasks'] as WorkflowGate[];
  return {
    stage,
    gates,
    remaining,
    ready: gates.every((gate) => remaining[gate] === 0),
    source: {
      protocol_code: workflow.protocolCode,
      workflow_name: workflow.name,
      workflow_version: workflow.version,
      workflow_status: workflow.status,
      stage_id: stage.id,
      stage_name: stage.name,
      stage_window: stage.window,
      completion_gates: gates,
    },
  };
};

export default function ProtocolOS() {
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [view, setView] = useState<View>('overview');
  const [selectedId, setSelectedId] = useState<Participant['id']>('SUB001');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: 1, role: 'agent', text: 'I can help you plan today’s work, open the right visit checklist, explain blockers, and complete approved tasks in this shared workspace.', meta: 'Live workflow context is ready' },
  ]);
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowDraft>(defaultWorkflowDraft);
  const [publishedWorkflow, setPublishedWorkflow] = useState<WorkflowDraft>(defaultWorkflowDraft);
  const [workflowSaveState, setWorkflowSaveState] = useState<'ready' | 'saving' | 'saved' | 'error'>('ready');
  const [webMcpStatus, setWebMcpStatus] = useState<WebMcpStatus>('checking');
  const [toolRuns, setToolRuns] = useState<ToolRun[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([
    { id: 'seed-1', subjectId: 'SUB001', actor: 'Coordinator', action: 'Completed Assessment B', time: '8:54 AM' },
    { id: 'seed-2', subjectId: 'SUB001', actor: 'Coordinator', action: 'Confirmed visit timing', time: '8:42 AM' },
  ]);
  const participantsRef = useRef(participants);
  const messageId = useRef(2);
  const toolRunId = useRef(1);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { participantsRef.current = participants; }, [participants]);

  useEffect(() => {
    const saved = window.localStorage.getItem('protocolos-demo-state-v4');
    const savedActivity = window.localStorage.getItem('protocolos-activity-v1');
    const savedPublishedWorkflow = window.localStorage.getItem('protocolos-published-workflow-v1');
    const savedToolRuns = window.localStorage.getItem('protocolos-webmcp-runs-v1');
    if (saved) {
      try { setParticipants(JSON.parse(saved)); } catch { /* Keep a clean demo state. */ }
    }
    if (savedActivity) {
      try { setActivityLog(JSON.parse(savedActivity)); } catch { /* Keep the seeded activity. */ }
    }
    if (savedPublishedWorkflow) {
      try { setPublishedWorkflow(JSON.parse(savedPublishedWorkflow)); } catch { /* Keep the seeded published workflow. */ }
    }
    if (savedToolRuns) {
      try { setToolRuns(JSON.parse(savedToolRuns)); } catch { /* Start a clean WebMCP session. */ }
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (storageReady) window.localStorage.setItem('protocolos-demo-state-v4', JSON.stringify(participants));
  }, [participants, storageReady]);

  useEffect(() => {
    if (storageReady) window.localStorage.setItem('protocolos-activity-v1', JSON.stringify(activityLog));
  }, [activityLog, storageReady]);

  useEffect(() => {
    if (storageReady) window.localStorage.setItem('protocolos-published-workflow-v1', JSON.stringify(publishedWorkflow));
  }, [publishedWorkflow, storageReady]);

  useEffect(() => {
    if (storageReady) window.localStorage.setItem('protocolos-webmcp-runs-v1', JSON.stringify(toolRuns));
  }, [storageReady, toolRuns]);

  useEffect(() => {
    fetch('/api/workflow')
      .then((response) => response.ok ? response.json() as Promise<WorkflowDraft> : Promise.reject(new Error('Workflow unavailable')))
      .then((draft) => {
        const normalized = {
          ...draft,
          stages: draft.stages.map((stage) => ({
          ...stage,
          window: ({
            'Window 1': 'At the start',
            'Window 2': 'After the first stage',
            'Windows 3–6': 'Recurring or as needed',
            'Windows 7–9': 'Ongoing cadence',
            'Study exit': 'When completion criteria are met',
          } as Record<string, string>)[stage.window] ?? stage.window,
        })),
        };
        setWorkflowDraft(normalized);
        if (normalized.status === 'published') setPublishedWorkflow(normalized);
      })
      .catch(() => setWorkflowSaveState('error'));
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const addActivity = useCallback((subjectId: Participant['id'], actor: ActivityEntry['actor'], action: string) => {
    setActivityLog((current) => [{ id: `${Date.now()}-${current.length}`, subjectId, actor, action, time: 'Just now' }, ...current].slice(0, 12));
  }, []);

  const findParticipant = useCallback((participantId: string) => {
    const participant = participantsRef.current.find((item) => item.id === participantId);
    if (!participant) throw new Error(`Unknown synthetic participant: ${participantId}`);
    return participant;
  }, []);

  const getParticipantStatus = useCallback((participantId: string) => {
    const p = findParticipant(participantId);
    const openTasks = p.tasks.filter((task) => !task.completed);
    const completedTasks = p.tasks.length - openTasks.length;
    const visitProgress = p.tasks.length ? Math.round((completedTasks / p.tasks.length) * 100) : 100;
    const operational = getOperationalContext(p, publishedWorkflow);
    return {
      participant_id: p.id,
      protocol: p.protocol,
      current_phase: p.phase,
      status: p.status,
      progress_percent: visitProgress,
      progress_scope: 'current_visit_tasks',
      overall_study_progress_percent: p.progress,
      next_visit: p.visits[0],
      completed_tasks: completedTasks,
      open_tasks: openTasks.length,
      summary: `${p.id} is in ${p.phase} with ${openTasks.length} open required tasks.`,
      workflow_source: operational.source,
      readiness: { ready: operational.ready, gated_by: operational.gates, remaining: operational.remaining },
      synthetic_data: true,
    };
  }, [findParticipant, publishedWorkflow]);

  const getRequiredAssessments = useCallback((participantId: string) => {
    const p = findParticipant(participantId);
    const operational = getOperationalContext(p, publishedWorkflow);
    return { participant_id: p.id, phase: p.phase, assessments: p.assessments.filter((item) => item.required), workflow_source: operational.source, synthetic_data: true };
  }, [findParticipant, publishedWorkflow]);

  const getUpcomingVisits = useCallback((participantId: string) => {
    const p = findParticipant(participantId);
    const operational = getOperationalContext(p, publishedWorkflow);
    return { participant_id: p.id, visits: p.visits.filter((item) => item.status !== 'Complete'), workflow_source: operational.source, synthetic_data: true };
  }, [findParticipant, publishedWorkflow]);

  const getSampleSchedule = useCallback((participantId: string) => {
    const p = findParticipant(participantId);
    const operational = getOperationalContext(p, publishedWorkflow);
    return { participant_id: p.id, samples: p.samples, workflow_source: operational.source, handling_note: 'All collection and processing details are synthetic demo content.', synthetic_data: true };
  }, [findParticipant, publishedWorkflow]);

  const getTodayPriorities = useCallback(() => {
    const priorities = participantsRef.current.map((p) => {
      const nextTask = p.tasks.find((task) => !task.completed);
      const operational = getOperationalContext(p, publishedWorkflow);
      return {
        participant_id: p.id,
        visit: p.visits[0],
        status: p.status,
        open_tasks: p.tasks.filter((task) => !task.completed).length,
        next_action: nextTask ? { task_id: nextTask.id, title: nextTask.title, due: nextTask.due } : null,
        workflow_stage: operational.source,
      };
    });
    return { as_of: 'synthetic_demo_day', operational_workflow: `${publishedWorkflow.protocolCode} v${publishedWorkflow.version}`, priorities, synthetic_data: true };
  }, [publishedWorkflow]);

  const getReadinessReport = useCallback((participantId: string) => {
    const p = findParticipant(participantId);
    const incompleteTasks = p.tasks.filter((task) => task.required && !task.completed);
    const dueAssessments = p.assessments.filter((item) => item.required && item.status !== 'Complete');
    const dueSamples = p.samples.filter((item) => item.status === 'Due');
    const operational = getOperationalContext(p, publishedWorkflow);
    const firstGate = operational.gates.find((gate) => operational.remaining[gate] > 0);
    const nextRequiredAction = firstGate === 'tasks' ? incompleteTasks[0] : firstGate === 'assessments' ? dueAssessments[0] : firstGate === 'samples' ? dueSamples[0] : null;
    return {
      participant_id: p.id,
      ready: operational.ready,
      proposed_phase: p.nextPhase,
      completion_gates: operational.gates,
      remaining: operational.remaining,
      non_gate_items_are_informational: (['tasks', 'assessments', 'samples'] as WorkflowGate[]).filter((gate) => !operational.gates.includes(gate)),
      next_required_action: nextRequiredAction,
      workflow_source: operational.source,
      synthetic_data: true,
    };
  }, [findParticipant, publishedWorkflow]);

  const saveWorkflow = useCallback(async (draft: WorkflowDraft, status: WorkflowDraft['status'] = 'draft') => {
    setWorkflowSaveState('saving');
    const next: WorkflowDraft = {
      ...draft,
      status,
      version: status === 'published' && draft.status !== 'published' ? draft.version + 1 : draft.version,
      updatedAt: new Date().toISOString(),
    };
    const response = await fetch('/api/workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    if (!response.ok) {
      setWorkflowSaveState('error');
      throw new Error('The workflow could not be saved.');
    }
    const saved = await response.json() as WorkflowDraft;
    setWorkflowDraft(saved);
    if (saved.status === 'published') setPublishedWorkflow(saved);
    setWorkflowSaveState('saved');
    window.setTimeout(() => setWorkflowSaveState('ready'), 1800);
    return { workflow: saved, operational_workflow_updated: saved.status === 'published', visible_ui_updated: true, synthetic_data: true };
  }, []);

  const updateWorkflowStage = useCallback(async (input: { stage_id: string; name?: string; window?: string; visits?: number; tasks?: number; assessments?: number; samples?: number; gates?: WorkflowGate[] }) => {
    if (!workflowDraft.stages.some((stage) => stage.id === input.stage_id)) throw new Error(`Unknown workflow stage: ${input.stage_id}`);
    const next: WorkflowDraft = {
      ...workflowDraft,
      status: 'draft',
      stages: workflowDraft.stages.map((stage) => stage.id === input.stage_id ? {
        ...stage,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.window !== undefined ? { window: input.window } : {}),
        ...(input.visits !== undefined ? { visits: input.visits } : {}),
        ...(input.tasks !== undefined ? { tasks: input.tasks } : {}),
        ...(input.assessments !== undefined ? { assessments: input.assessments } : {}),
        ...(input.samples !== undefined ? { samples: input.samples } : {}),
        ...(input.gates !== undefined ? { gates: input.gates } : {}),
      } : stage),
    };
    setView('builder');
    return saveWorkflow(next, 'draft');
  }, [saveWorkflow, workflowDraft]);

  const checkMissingTasks = useCallback((participantId: string) => {
    const p = findParticipant(participantId);
    const missing = p.tasks.filter((task) => task.required && !task.completed);
    const operational = getOperationalContext(p, publishedWorkflow);
    return { participant_id: p.id, missing_count: missing.length, missing_tasks: missing, ready_to_close_visit: operational.gates.includes('tasks') ? missing.length === 0 : true, workflow_source: operational.source, synthetic_data: true };
  }, [findParticipant, publishedWorkflow]);

  const createVisitChecklist = useCallback((participantId: string) => {
    const p = findParticipant(participantId);
    setSelectedId(p.id);
    setView('checklist');
    setAssistantOpen(true);
    addActivity(p.id, 'Agent', `Opened ${p.visits[0].name} checklist`);
    const tasks = p.tasks.map((task, index) => ({ order: index + 1, ...task }));
    const operational = getOperationalContext(p, publishedWorkflow);
    return { participant_id: p.id, visit: p.visits[0].name, checklist_id: `CL-${p.id}-${p.visits[0].id}`, generated_from: operational.source, completion_gates: operational.gates, tasks, complete_count: tasks.filter((task) => task.completed).length, total_count: tasks.length, synthetic_data: true };
  }, [addActivity, findParticipant, publishedWorkflow]);

  const markTaskComplete = useCallback((participantId: string, taskId: string, actor: ActivityEntry['actor'] = 'Agent') => {
    const p = findParticipant(participantId);
    const target = p.tasks.find((task) => task.id === taskId);
    if (!target) throw new Error(`Task ${taskId} was not found for ${participantId}.`);
    if (target.completed) return { participant_id: p.id, task_id: target.id, status: 'already_complete', task: target };

    const completedAt = actor === 'Agent' ? 'Just now · agent action' : 'Just now · coordinator action';
    const normalizedTitle = target.title.toLowerCase();
    const linkedAssessment = p.assessments.find((assessment) => normalizedTitle.includes(assessment.name.toLowerCase()));
    const linkedSample = p.samples.find((sample) => normalizedTitle.includes(sample.type.toLowerCase()));
    setParticipants((current) => current.map((item) => {
      if (item.id !== participantId) return item;
      return {
        ...item,
        lastActivity: `${target.title} · just now`,
        tasks: item.tasks.map((task) => task.id === taskId ? { ...task, completed: true, completedAt } : task),
        assessments: item.assessments.map((assessment) => {
          return assessment.id === linkedAssessment?.id ? { ...assessment, status: 'Complete' as const } : assessment;
        }),
        samples: item.samples.map((sample) => {
          return sample.id === linkedSample?.id ? { ...sample, status: 'Collected' as const } : sample;
        }),
      };
    }));
    addActivity(p.id, actor, formatCompletedActivity(target.title));
    const synchronized_records = [linkedAssessment ? { type: 'assessment', id: linkedAssessment.id, status: 'Complete' } : null, linkedSample ? { type: 'sample', id: linkedSample.id, status: 'Collected' } : null].filter(Boolean);
    return { participant_id: p.id, task_id: target.id, task_title: target.title, status: 'completed', completed_at: completedAt, actor, synchronized_records, workflow_source: getOperationalContext(p, publishedWorkflow).source, visible_ui_updated: true, synthetic_data: true };
  }, [addActivity, findParticipant, publishedWorkflow]);

  const advanceStudyPhase = useCallback((participantId: string) => {
    const p = findParticipant(participantId);
    const missingTasks = p.tasks.filter((task) => task.required && !task.completed);
    const dueAssessments = p.assessments.filter((item) => item.required && item.status !== 'Complete');
    const dueSamples = p.samples.filter((item) => item.status === 'Due');
    const operational = getOperationalContext(p, publishedWorkflow);
    const blockers = [
      ...(operational.gates.includes('tasks') ? missingTasks.map((item) => `Task: ${item.title}`) : []),
      ...(operational.gates.includes('assessments') ? dueAssessments.map((item) => `Assessment: ${item.name}`) : []),
      ...(operational.gates.includes('samples') ? dueSamples.map((item) => `Sample: ${item.type}`) : []),
    ];
    if (blockers.length) {
      return { participant_id: p.id, advanced: false, current_phase: p.phase, proposed_phase: p.nextPhase, blocker_count: blockers.length, blockers, completion_gates: operational.gates, workflow_source: operational.source, decision: 'Not ready to advance', synthetic_data: true };
    }
    setParticipants((current) => current.map((item) => item.id === participantId ? { ...item, phase: item.nextPhase, status: 'On track', progress: Math.min(100, item.progress + 18), lastActivity: `Advanced to ${item.nextPhase} · just now` } : item));
    addActivity(p.id, 'Agent', `Advanced workflow to ${p.nextPhase}`);
    return { participant_id: p.id, advanced: true, previous_phase: p.phase, current_phase: p.nextPhase, workflow_source: operational.source, decision: 'Phase advanced', visible_ui_updated: true, synthetic_data: true };
  }, [addActivity, findParticipant, publishedWorkflow]);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!modelContext?.registerTool) {
      setWebMcpStatus('unavailable');
      return;
    }
    setWebMcpStatus('checking');
    const controller = new AbortController();
    const readOnly = { readOnlyHint: true };
    const mutable = { readOnlyHint: false };
    const runTracked = async (tool: string, title: string, access: ToolRun['access'], input: Record<string, unknown>, action: () => unknown | Promise<unknown>) => {
      const subjectId = typeof input.participant_id === 'string' ? input.participant_id : undefined;
      if (subjectId && ['SUB001', 'SUB002', 'SUB003'].includes(subjectId)) setSelectedId(subjectId as Participant['id']);
      setAssistantOpen(true);
      try {
        const result = await action();
        const value = result && typeof result === 'object' ? result as Record<string, unknown> : {};
        const status: ToolRun['status'] = tool === 'advance_study_phase' && value.advanced === false ? 'blocked' : 'completed';
        const uiChanged = Boolean(value.visible_ui_updated) || ['create_visit_checklist', 'update_protocol_stage', 'publish_protocol_workflow'].includes(tool);
        const receipt = { tool_name: tool, access, status, ui_changed: uiChanged, completed_at: 'Just now' };
        setToolRuns((current) => [{ id: `run-${Date.now()}-${toolRunId.current++}`, tool, title, access, status, subjectId, summary: summarizeToolOutcome(tool, result), uiChanged, time: 'Just now' }, ...current].slice(0, 12));
        return toolResult(result && typeof result === 'object' ? { ...value, webmcp_receipt: receipt } : { result, webmcp_receipt: receipt });
      } catch (error) {
        setToolRuns((current) => [{ id: `run-${Date.now()}-${toolRunId.current++}`, tool, title, access, status: 'failed' as const, subjectId, summary: error instanceof Error ? error.message : 'The tool could not complete', uiChanged: false, time: 'Just now' }, ...current].slice(0, 12));
        throw error;
      }
    };
    const tools = [
      { name: 'get_today_priorities', title: 'Get today’s priorities', description: 'Get the ordered visit workload and next required action across all synthetic subjects.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: readOnly, execute: () => runTracked('get_today_priorities', 'Get today’s priorities', 'read', {}, getTodayPriorities) },
      { name: 'get_study_portfolio', title: 'Get study portfolio', description: 'Compare the status, workload, enrollment, milestones, and stage sequence across all synthetic studies.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: readOnly, execute: () => runTracked('get_study_portfolio', 'Get study portfolio', 'read', {}, () => ({ studies: studyPortfolio, synthetic_data: true })) },
      { name: 'get_protocol_workflow', title: 'Get protocol workflow', description: 'Get the published operational workflow that currently governs subject checklists and readiness, plus any draft status.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: readOnly, execute: () => runTracked('get_protocol_workflow', 'Get protocol workflow', 'read', {}, () => ({ operational_workflow: publishedWorkflow, draft_status: workflowDraft.status, draft_version: workflowDraft.version, synthetic_data: true })) },
      { name: 'update_protocol_stage', title: 'Update protocol stage', description: 'Update one stage in the saved protocol draft and open the workflow builder so the coordinator can review it.', inputSchema: stageUpdateSchema, annotations: mutable, execute: (input: { stage_id: string; name?: string; window?: string; visits?: number; tasks?: number; assessments?: number; samples?: number; gates?: WorkflowGate[] }) => runTracked('update_protocol_stage', 'Update protocol stage', 'write', input, () => updateWorkflowStage(input)) },
      { name: 'publish_protocol_workflow', title: 'Publish protocol workflow', description: 'Publish the reviewed protocol draft so the workflow map and agent use the same version.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: mutable, execute: () => runTracked('publish_protocol_workflow', 'Publish protocol workflow', 'write', {}, () => saveWorkflow(workflowDraft, 'published')) },
      { name: 'get_participant_status', title: 'Get subject status', description: 'Get the current workflow stage, visit, task counts, and operational status for a synthetic subject.', inputSchema: participantSchema, annotations: readOnly, execute: ({ participant_id }: { participant_id: string }) => runTracked('get_participant_status', 'Get subject status', 'read', { participant_id }, () => getParticipantStatus(participant_id)) },
      { name: 'get_required_assessments', title: 'Get required assessments', description: 'List workflow-required assessments and their completion status for a synthetic subject.', inputSchema: participantSchema, annotations: readOnly, execute: ({ participant_id }: { participant_id: string }) => runTracked('get_required_assessments', 'Get required assessments', 'read', { participant_id }, () => getRequiredAssessments(participant_id)) },
      { name: 'get_upcoming_visits', title: 'Get upcoming visits', description: 'List scheduled and in-progress visits with their timing and status for a synthetic subject.', inputSchema: participantSchema, annotations: readOnly, execute: ({ participant_id }: { participant_id: string }) => runTracked('get_upcoming_visits', 'Get upcoming visits', 'read', { participant_id }, () => getUpcomingVisits(participant_id)) },
      { name: 'get_sample_schedule', title: 'Get sample schedule', description: 'Get synthetic sample collection and handling requirements for a subject.', inputSchema: participantSchema, annotations: readOnly, execute: ({ participant_id }: { participant_id: string }) => runTracked('get_sample_schedule', 'Get sample schedule', 'read', { participant_id }, () => getSampleSchedule(participant_id)) },
      { name: 'check_missing_tasks', title: 'Check missing tasks', description: 'Find required incomplete tasks and determine whether the current visit can close.', inputSchema: participantSchema, annotations: readOnly, execute: ({ participant_id }: { participant_id: string }) => runTracked('check_missing_tasks', 'Check missing tasks', 'read', { participant_id }, () => checkMissingTasks(participant_id)) },
      { name: 'get_readiness_report', title: 'Get readiness report', description: 'Explain whether a synthetic subject can advance and identify the next required action without changing workflow state.', inputSchema: participantSchema, annotations: readOnly, execute: ({ participant_id }: { participant_id: string }) => runTracked('get_readiness_report', 'Get readiness report', 'read', { participant_id }, () => getReadinessReport(participant_id)) },
      { name: 'create_visit_checklist', title: 'Create visit checklist', description: 'Create and visibly open an ordered checklist from the subject workflow requirements.', inputSchema: participantSchema, annotations: mutable, execute: ({ participant_id }: { participant_id: string }) => runTracked('create_visit_checklist', 'Create visit checklist', 'write', { participant_id }, () => createVisitChecklist(participant_id)) },
      { name: 'mark_task_complete', title: 'Mark task complete', description: 'Mark one synthetic visit task complete and update the visible ProtocolOS workspace.', inputSchema: { type: 'object', properties: { participant_id: participantSchema.properties.participant_id, task_id: { type: 'string', description: 'Task ID from a subject checklist, such as T-001-3.' } }, required: ['participant_id', 'task_id'], additionalProperties: false }, annotations: mutable, execute: ({ participant_id, task_id }: { participant_id: string; task_id: string }) => runTracked('mark_task_complete', 'Mark task complete', 'write', { participant_id, task_id }, () => markTaskComplete(participant_id, task_id)) },
      { name: 'advance_study_phase', title: 'Advance workflow stage', description: 'Check all workflow completion criteria and advance a synthetic subject only when no required blockers remain.', inputSchema: participantSchema, annotations: mutable, execute: ({ participant_id }: { participant_id: string }) => runTracked('advance_study_phase', 'Advance workflow stage', 'write', { participant_id }, () => advanceStudyPhase(participant_id)) },
    ];
    Promise.all(tools.map((tool) => modelContext.registerTool(tool, { signal: controller.signal }))).then(() => setWebMcpStatus('connected')).catch(() => setWebMcpStatus('unavailable'));
    return () => controller.abort();
  }, [advanceStudyPhase, checkMissingTasks, createVisitChecklist, getParticipantStatus, getReadinessReport, getRequiredAssessments, getSampleSchedule, getTodayPriorities, getUpcomingVisits, markTaskComplete, publishedWorkflow, saveWorkflow, updateWorkflowStage, workflowDraft]);

  const selected = participants.find((item) => item.id === selectedId) ?? participants[0];
  const openTasks = participants.reduce((sum, item) => sum + item.tasks.filter((task) => !task.completed).length, 0);
  const dueSamples = participants.reduce((sum, item) => sum + item.samples.filter((sample) => sample.status === 'Due').length, 0);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return participants.flatMap((p) => {
      const subjectMatch = `${p.id} ${p.alias} ${p.phase} ${p.visits.map((visit) => visit.name).join(' ')}`.toLowerCase().includes(query)
        ? [{ type: 'subject' as const, subjectId: p.id, title: p.id, detail: `${p.phase} · ${p.visits[0].name}` }]
        : [];
      const taskMatches = p.tasks
        .filter((task) => `${task.id} ${task.title} ${task.category}`.toLowerCase().includes(query))
        .slice(0, 3)
        .map((task) => ({ type: 'task' as const, subjectId: p.id, title: task.title, detail: `${p.id} · ${task.due}` }));
      return [...subjectMatch, ...taskMatches];
    }).slice(0, 7);
  }, [participants, searchQuery]);

  const pushMessage = (message: Omit<AssistantMessage, 'id'>) => {
    const next = { ...message, id: messageId.current++ };
    setMessages((current) => [...current, next]);
  };

  const resolveSubjectId = (text = ''): Participant['id'] => {
    const match = text.toUpperCase().match(/SUB00[1-3]/)?.[0];
    return participants.some((item) => item.id === match) ? match as Participant['id'] : selectedId;
  };

  const runStatusDemo = (subjectId: Participant['id'] = selectedId, includeUser = true) => {
    setAssistantOpen(true);
    setSelectedId(subjectId);
    if (includeUser) pushMessage({ role: 'user', text: `What does ${subjectId} need to complete today?` });
    const result = getParticipantStatus(subjectId);
    const missing = checkMissingTasks(subjectId);
    const samples = getSampleSchedule(subjectId);
    const next = missing.missing_tasks[0];
    pushMessage({ role: 'agent', text: `${subjectId} is in ${result.current_phase}. ${missing.missing_count} required tasks remain.${next ? ` The next action is “${next.title}” (${next.due}).` : ' The current visit checklist is complete.'} ${samples.samples.filter((sample) => sample.status === 'Due').length} samples are due.`, meta: 'Reviewed live subject status, tasks, and samples', actions: ['checklist', 'assessments', 'samples'] });
  };

  const runPrioritiesDemo = () => {
    setAssistantOpen(true);
    pushMessage({ role: 'user', text: 'What needs attention across today’s studies?' });
    const result = getTodayPriorities();
    const totalOpen = result.priorities.reduce((sum, item) => sum + item.open_tasks, 0);
    const queue = result.priorities.map((item) => `${item.participant_id} at ${item.visit.time} — ${item.open_tasks} open`).join('; ');
    pushMessage({ role: 'agent', text: `You have ${result.priorities.length} visits and ${totalOpen} open tasks today. Here is the queue by visit time: ${queue}.`, meta: 'Reviewed today’s work queue across active workflows' });
  };

  const runChecklistDemo = (subjectId: Participant['id'] = selectedId, includeUser = true) => {
    const result = createVisitChecklist(subjectId);
    if (includeUser) pushMessage({ role: 'user', text: `Create the visit checklist for ${subjectId}.` });
    pushMessage({ role: 'agent', text: `Checklist ${result.checklist_id} is open in the workspace with ${result.total_count} steps. ${result.complete_count} are already complete. You can review every change as it happens.`, meta: 'Created from the published workflow', actions: ['advance'] });
  };

  const runReadinessDemo = (subjectId: Participant['id'] = selectedId, includeUser = true) => {
    const result = getReadinessReport(subjectId);
    setSelectedId(subjectId);
    if (includeUser) pushMessage({ role: 'user', text: `Can ${subjectId} advance to the next stage?` });
    pushMessage({ role: 'agent', text: result.ready ? `Yes. ${subjectId} meets the published completion gates for ${result.proposed_phase}. No workflow change was made.` : `Not yet. The published gates still have ${result.remaining.tasks} tasks, ${result.remaining.assessments} assessments, and ${result.remaining.samples} samples pending.${result.next_required_action && 'title' in result.next_required_action ? ` Start with “${result.next_required_action.title}.”` : ''}`, meta: `Checked ${result.completion_gates.join(', ')} gates from workflow v${result.workflow_source.workflow_version}`, actions: result.ready ? ['advance-stage'] : ['checklist'] });
  };

  const runPhaseAdvance = (subjectId: Participant['id'] = selectedId) => {
    const result = advanceStudyPhase(subjectId);
    pushMessage({ role: 'user', text: `Advance ${subjectId} to the next stage.` });
    pushMessage({ role: 'agent', text: result.advanced ? `${subjectId} advanced to ${result.current_phase}. The subject record and activity trail are updated.` : `I did not advance ${subjectId}. ${result.blocker_count} workflow blockers remain.`, meta: result.advanced ? 'Workflow gate passed · stage updated' : 'Workflow gate prevented the change', actions: result.advanced ? [] : ['checklist'] });
    setAssistantOpen(true);
  };

  const runAssessmentsDemo = (subjectId: Participant['id'] = selectedId, includeUser = true) => {
    const result = getRequiredAssessments(subjectId);
    if (includeUser) pushMessage({ role: 'user', text: `Show required assessments for ${subjectId}.` });
    const due = result.assessments.filter((item) => item.status !== 'Complete');
    pushMessage({ role: 'agent', text: `${subjectId} has ${due.length} required assessments pending: ${due.map((item) => `${item.name} (${item.window})`).join(', ') || 'none'}.`, meta: 'Reviewed required assessments' });
  };

  const runSamplesDemo = (subjectId: Participant['id'] = selectedId, includeUser = true) => {
    const result = getSampleSchedule(subjectId);
    if (includeUser) pushMessage({ role: 'user', text: `Show the sample schedule for ${subjectId}.` });
    pushMessage({ role: 'agent', text: result.samples.length ? `${subjectId} has ${result.samples.length} sample requirements: ${result.samples.map((item) => `${item.type} — ${item.collection}, ${item.status.toLowerCase()}`).join('; ')}.` : `${subjectId} has no sample requirements for this visit.`, meta: 'Reviewed sample schedule and handling' });
  };

  const submitInput = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    pushMessage({ role: 'user', text: trimmed });
    const subjectId = resolveSubjectId(trimmed);
    setSelectedId(subjectId);
    const wantsCompletion = /\b(mark|finish)\b/i.test(trimmed) || /^complete\s+(?:the\s+next\s+task|task|assessment|sample|T-)/i.test(trimmed);
    if (wantsCompletion) {
      const subject = findParticipant(subjectId);
      const namedTask = subject.tasks.find((task) => trimmed.toLowerCase().includes(task.title.toLowerCase()));
      const taskId = trimmed.toUpperCase().match(/T-00[1-3]-\d+/)?.[0] ?? namedTask?.id ?? (/\bnext\b/i.test(trimmed) ? subject.tasks.find((task) => !task.completed)?.id : undefined);
      if (!taskId) pushMessage({ role: 'agent', text: `I couldn’t match that request to a task for ${subjectId}. Include the task name, task ID, or say “complete the next task.”`, meta: 'No workflow change made' });
      else {
        const result = markTaskComplete(subjectId, taskId, 'Agent');
        pushMessage({ role: 'agent', text: result.status === 'already_complete' ? `${taskId} was already complete.` : `Done — “${result.task_title}” is complete. The checklist, assessment/sample status, and activity trail are updated.`, meta: 'Updated the live workspace', actions: ['advance'] });
      }
    } else if (/checklist/i.test(trimmed)) runChecklistDemo(subjectId, false);
    else if (/advance|ready|readiness|blocker/i.test(trimmed)) runReadinessDemo(subjectId, false);
    else if (/assessment/i.test(trimmed)) runAssessmentsDemo(subjectId, false);
    else if (/sample/i.test(trimmed)) runSamplesDemo(subjectId, false);
    else if (/priorit|today|workload/i.test(trimmed) && !/SUB00/i.test(trimmed)) {
      const result = getTodayPriorities();
      const totalOpen = result.priorities.reduce((sum, item) => sum + item.open_tasks, 0);
      const queue = result.priorities.map((item) => `${item.participant_id} at ${item.visit.time} — ${item.open_tasks} open`).join('; ');
      pushMessage({ role: 'agent', text: `You have ${result.priorities.length} visits and ${totalOpen} open tasks today. Here is the queue by visit time: ${queue}.`, meta: 'Reviewed today’s live work queue across active workflows' });
    } else runStatusDemo(subjectId, false);
  };

  const resetDemo = () => {
    setParticipants(initialParticipants);
    setSelectedId('SUB001');
    setView('overview');
    setMessages([{ id: messageId.current++, role: 'agent', text: 'Workspace reset. Today’s study operations are ready to review.', meta: 'Synthetic state restored' }]);
    setActivityLog([
      { id: 'seed-1', subjectId: 'SUB001', actor: 'Coordinator', action: 'Completed Assessment B', time: '8:54 AM' },
      { id: 'seed-2', subjectId: 'SUB001', actor: 'Coordinator', action: 'Confirmed visit timing', time: '8:42 AM' },
    ]);
    setToolRuns([]);
    setAssistantOpen(false);
  };

  const nav = [
    { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'studies' as const, label: 'Studies', icon: Library },
    { id: 'participants' as const, label: 'Subjects', icon: Users },
    { id: 'protocol' as const, label: 'Workflow', icon: Workflow },
    { id: 'checklist' as const, label: 'Visit checklist', icon: ClipboardCheck },
  ];

  return (
    <main className={`app-shell ${assistantOpen ? 'assistant-visible' : ''}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setView('overview')} aria-label="ProtocolOS home">
          <span className="brand-mark" aria-hidden="true"><img className="brand-symbol" src="/protocolos-sidebar-source.png" alt="" width="2172" height="724" /></span>
          <span className="brand-word">Protocol<span>OS</span></span>
        </button>
        <nav aria-label="Primary navigation">
          {nav.map((item) => <button key={item.id} className={`nav-item ${view === item.id || (item.id === 'participants' && view === 'participant') || (item.id === 'protocol' && view === 'builder') ? 'active' : ''}`} onClick={() => setView(item.id)}><item.icon size={18} />{item.label}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="study-card"><small>ACTIVE WORKSPACE</small><strong>{workflowDraft.protocolCode}</strong><span>{workflowDraft.status === 'published' ? `Published · v${workflowDraft.version}` : 'Draft changes in progress'}</span></div>
          <button className="reset-button" onClick={resetDemo}><RefreshCw size={13} />Reset challenge demo</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="search-wrap"><div className="search"><Search size={17} /><input ref={searchRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search subject, visit, or task…" aria-label="Search workspace" /><kbd>⌘ K</kbd></div>{searchQuery && <div className="search-results">{searchResults.length ? searchResults.map((result, index) => <button key={`${result.subjectId}-${result.title}-${index}`} onClick={() => { setSelectedId(result.subjectId); setView(result.type === 'task' ? 'checklist' : 'participant'); setSearchQuery(''); }}><span className="search-result-icon">{result.type === 'task' ? <ClipboardCheck size={15} /> : <UserRound size={15} />}</span><span><strong>{result.title}</strong><small>{result.detail}</small></span><ArrowRight size={14} /></button>) : <div className="search-empty">No matching subjects or tasks</div>}</div>}</div>
          <button className={`agent-toggle ${webMcpStatus}`} onClick={() => setAssistantOpen((open) => !open)}><i className="session-dot" /><Sparkles size={14} />Agent workspace</button>
          <button className="avatar" aria-label="Study coordinator profile">CL</button>
        </header>

        <div className="content">
          {view === 'overview' && <Overview participants={participants} openTasks={openTasks} dueSamples={dueSamples} activityLog={activityLog} onAsk={runPrioritiesDemo} onViewSubjects={() => setView('participants')} onChecklist={(id) => runChecklistDemo(id)} />}
          {view === 'studies' && <Studies onOpenWorkflow={() => setView('protocol')} />}
          {view === 'participants' && <Participants participants={participants} onParticipant={(id) => { setSelectedId(id); setView('participant'); }} />}
          {view === 'participant' && <ParticipantDetail participant={selected} onBack={() => setView('participants')} onChecklist={() => runChecklistDemo(selected.id)} onAsk={() => runStatusDemo(selected.id)} onReadiness={() => runReadinessDemo(selected.id)} />}
          {view === 'protocol' && <ProtocolWorkflow draft={workflowDraft} onEdit={() => setView('builder')} />}
          {view === 'builder' && <WorkflowBuilder draft={workflowDraft} saveState={workflowSaveState} onBack={() => setView('protocol')} onChange={(next) => { setWorkflowDraft({ ...next, status: 'draft' }); setWorkflowSaveState('ready'); }} onSave={() => void saveWorkflow(workflowDraft, 'draft').catch(() => {})} onPublish={() => void saveWorkflow(workflowDraft, 'published').catch(() => {})} />}
          {view === 'checklist' && <Checklist participant={selected} workflow={publishedWorkflow} activityLog={activityLog.filter((entry) => entry.subjectId === selected.id)} onParticipantChange={setSelectedId} onComplete={(taskId) => { const result = markTaskComplete(selected.id, taskId, 'Coordinator'); pushMessage({ role: 'agent', text: `I saw your update: “${result.task_title}” is complete. I refreshed ${selected.id}’s readiness context.`, meta: 'Shared workspace synchronized', actions: ['advance'] }); }} onAsk={() => runStatusDemo(selected.id)} onAdvance={() => runReadinessDemo(selected.id)} onAdvanceStage={() => runPhaseAdvance(selected.id)} />}
        </div>
      </section>

      {assistantOpen && <AssistantPanel selectedId={selectedId} webMcpStatus={webMcpStatus} toolRuns={toolRuns} messages={messages} input={input} onInput={setInput} onSubmit={submitInput} onClose={() => setAssistantOpen(false)} onStatus={() => runStatusDemo(selectedId)} onChecklist={() => runChecklistDemo(selectedId)} onAssessments={() => runAssessmentsDemo(selectedId)} onSamples={() => runSamplesDemo(selectedId)} onAdvance={() => runReadinessDemo(selectedId)} onAdvanceStage={() => runPhaseAdvance(selectedId)} />}
    </main>
  );
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><p>{eyebrow}</p><h1>{title}</h1><span>{subtitle}</span></div>{action}</div>;
}

function Overview({ participants, openTasks, dueSamples, activityLog, onAsk, onViewSubjects, onChecklist }: { participants: Participant[]; openTasks: number; dueSamples: number; activityLog: ActivityEntry[]; onAsk: () => void; onViewSubjects: () => void; onChecklist: (id: Participant['id']) => void }) {
  return <>
    <PageHeading eyebrow="OPERATIONS OVERVIEW · SYNTHETIC DEMO DAY" title="Today’s study operations" subtitle="Review priorities across active workflows, visits, and subjects." action={<button className="assistant-button" onClick={onAsk}><Bot size={18} />Review today’s priorities</button>} />
    <section className="metric-grid" aria-label="Study metrics">
      <Metric icon={<Users size={18} />} tone="blue" label="Active subjects" value="3" detail="Across current workflows" />
      <Metric icon={<CalendarDays size={18} />} tone="green" label="Visits today" value="3" detail="1 in progress" />
      <Metric icon={<ClipboardCheck size={18} />} tone="amber" label="Open tasks" value={String(openTasks)} detail="4 due this morning" />
      <Metric icon={<FlaskConical size={18} />} tone="purple" label="Samples due" value={String(dueSamples)} detail="2 collection types" />
    </section>
    <div className="main-grid">
      <section className="panel priorities-panel">
        <div className="panel-head"><div><span className="eyebrow">TODAY’S WORK QUEUE</span><h2>Next actions by visit time</h2></div><button onClick={onViewSubjects}>View all subjects <ArrowRight size={15} /></button></div>
        <div className="priority-list">{participants.map((item, index) => <article className="priority" key={item.id}>
          <div className="time"><strong>{item.visits[0].time}</strong><span>Today</span></div><div className={`priority-line ${['blue', 'amber', 'purple'][index]}`} />
          <div className="priority-copy"><div><span className="participant-pill">{item.id}</span><h3>{item.visits[0].name}</h3></div><p><b>Next:</b> {item.tasks.find((task) => !task.completed)?.title ?? 'Review completed visit'} · {item.tasks.filter((task) => !task.completed).length} open</p></div>
          <button onClick={() => onChecklist(item.id)} aria-label={`Open ${item.id} checklist`}><ArrowRight size={18} /></button>
        </article>)}</div>
      </section>
      <aside className="panel agent-panel"><div className="agent-orb"><Bot size={24} /></div><span className="eyebrow">OPERATIONS COPILOT</span><h2>Turn workflow context into the next action.</h2><p>Ask across tasks, assessments, samples, visits, and readiness. ProtocolOS can open the right workspace and make approved updates while you watch.</p><button onClick={onAsk}>Summarize today’s priorities<ArrowRight size={16} /></button></aside>
    </div>
    <section className="operations-strip"><div className="operations-head"><div><span className="eyebrow">SHARED ACTIVITY</span><h2>Human + agent workspace</h2></div><span><ShieldCheck size={14} />Synthetic data only</span></div><div className="activity-row">{activityLog.slice(0, 3).map((entry) => <div key={entry.id}><i className={entry.actor.toLowerCase()}>{entry.actor === 'Agent' ? <Sparkles size={13} /> : <UserRound size={13} />}</i><span><strong>{entry.action}</strong><small>{entry.subjectId} · {entry.actor} · {entry.time}</small></span></div>)}</div></section>
  </>;
}

function Metric({ icon, tone, label, value, detail }: { icon: React.ReactNode; tone: string; label: string; value: string; detail: string }) {
  return <article><span className={`metric-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function Studies({ onOpenWorkflow }: { onOpenWorkflow: () => void }) {
  const [selectedId, setSelectedId] = useState<StudySummary['id']>('STUDY-01');
  const selected = studyPortfolio.find((study) => study.id === selectedId) ?? studyPortfolio[0];
  const activeStudies = studyPortfolio.filter((study) => study.status === 'Active').length;
  const activeSubjects = studyPortfolio.reduce((sum, study) => sum + study.activeSubjects, 0);
  const openActions = studyPortfolio.reduce((sum, study) => sum + study.openActions, 0);
  const progress = Math.round((selected.activeSubjects / selected.targetSubjects) * 100);

  return <><PageHeading eyebrow="STUDY PORTFOLIO · SYNTHETIC DATA" title="Studies" subtitle="Compare programs without mixing their subjects, tasks, or workflow context." />
    <section className="metric-grid" aria-label="Study portfolio metrics">
      <Metric icon={<Library size={18} />} tone="blue" label="Studies" value={String(studyPortfolio.length)} detail={`${activeStudies} currently active`} />
      <Metric icon={<Users size={18} />} tone="green" label="Active subjects" value={String(activeSubjects)} detail="Across the portfolio" />
      <Metric icon={<ClipboardCheck size={18} />} tone="amber" label="Open actions" value={String(openActions)} detail="Across all studies" />
      <Metric icon={<Workflow size={18} />} tone="purple" label="In planning" value="1" detail="Workflow under review" />
    </section>
    <section className="studies-layout"><div className="panel study-list-panel"><div className="panel-head"><div><span className="eyebrow">ALL STUDIES</span><h2>Choose a study to inspect</h2></div><span className="portfolio-count">{studyPortfolio.length} studies</span></div><div className="study-list">{studyPortfolio.map((study) => {
      const studyProgress = Math.round((study.activeSubjects / study.targetSubjects) * 100);
      return <button className={`study-row ${selected.id === study.id ? 'selected' : ''}`} key={study.id} onClick={() => setSelectedId(study.id)}><div className="study-row-head"><span>{study.id}</span><i className={study.status.toLowerCase()}>{study.status}</i></div><h3>{study.name}</h3><p>{study.model}</p><div className="study-progress"><i><em style={{ width: `${studyProgress}%` }} /></i><span>{study.activeSubjects} / {study.targetSubjects} subjects</span></div><footer><span><ClipboardCheck size={13} />{study.openActions} open actions</span><span><CalendarDays size={13} />{study.nextMilestone}</span></footer></button>;
    })}</div></div>
      <aside className="panel study-detail-panel"><div className="study-detail-head"><span className="eyebrow">SELECTED STUDY</span>{selected.id === 'STUDY-01' && <i>Active workspace</i>}</div><span className="study-detail-code">{selected.id}</span><h2>{selected.name}</h2><p>{selected.description}</p><div className="study-detail-progress"><div><span>Subject progress</span><strong>{progress}%</strong></div><i><em style={{ width: `${progress}%` }} /></i><small>{selected.activeSubjects} active of {selected.targetSubjects} planned</small></div><div className="study-milestone"><CalendarDays size={16} /><span><small>NEXT MILESTONE</small><strong>{selected.nextMilestone}</strong></span></div><div className="study-stage-list"><span className="eyebrow">WORKFLOW STAGES</span>{selected.stages.map((stage, index) => <div key={stage}><i>{index + 1}</i><span>{stage}</span>{index < selected.stages.length - 1 && <em />}</div>)}</div>{selected.id === 'STUDY-01' ? <button className="open-study-workflow" onClick={onOpenWorkflow}>Open active workflow <ArrowRight size={15} /></button> : <div className="portfolio-note"><ShieldCheck size={14} />Synthetic portfolio summary · separate workspace</div>}</aside>
    </section>
  </>;
}

function Participants({ participants, onParticipant }: { participants: Participant[]; onParticipant: (id: Participant['id']) => void }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | Participant['status']>('All');
  const statusOptions: ('All' | Participant['status'])[] = ['All', 'Needs attention', 'On track', 'Pending'];
  const visible = participants.filter((p) => (statusFilter === 'All' || p.status === statusFilter) && `${p.id} ${p.alias} ${p.phase}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHeading eyebrow="STUDY-01 · 3 ACTIVE" title="Subjects" subtitle="Synthetic records with current stage, visit, and readiness context." />
    <section className="panel participants-panel"><div className="table-tools"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find Subject ID" /></label><button onClick={() => setStatusFilter((current) => statusOptions[(statusOptions.indexOf(current) + 1) % statusOptions.length])}>{statusFilter === 'All' ? 'All statuses' : statusFilter} <ChevronRight size={14} /></button></div>
      <div className="participant-table"><div className="table-row header"><span>Subject ID</span><span>Workflow stage</span><span>Next visit</span><span>Progress</span><span>Status</span><span /></div>
        {visible.map((p) => <button className="table-row" key={p.id} onClick={() => onParticipant(p.id)}><span className="participant-name"><i>{p.id.slice(-2)}</i><b>{p.id}<small>{p.alias}</small></b></span><span><b>{p.phase}</b><small>{p.protocol}</small></span><span><b>{p.nextVisit}</b><small>{p.visits[0].window}</small></span><span className="progress-cell"><i><em style={{ width: `${p.progress}%` }} /></i><b>{p.progress}%</b></span><span><StatusBadge status={p.status} /></span><span><ChevronRight size={16} /></span></button>)}
        {!visible.length && <div className="table-empty">No subjects match this view.</div>}
      </div></section></>;
}

function StatusBadge({ status }: { status: Participant['status'] }) { return <span className={`status-badge ${status.toLowerCase().replaceAll(' ', '-')}`}><i />{status}</span>; }

function ParticipantDetail({ participant: p, onBack, onChecklist, onAsk, onReadiness }: { participant: Participant; onBack: () => void; onChecklist: () => void; onAsk: () => void; onReadiness: () => void }) {
  const completed = p.tasks.filter((task) => task.completed).length;
  const nextTask = p.tasks.find((task) => !task.completed);
  return <><button className="back-button" onClick={onBack}><ArrowLeft size={15} />All subjects</button>
    <section className="participant-hero"><div className="profile-mark">{p.id.slice(-2)}</div><div><span className="participant-pill">SYNTHETIC SUBJECT ID</span><h1>{p.id}</h1><p>{p.alias} · Added {p.enrolled}</p></div><StatusBadge status={p.status} /><div className="hero-actions"><button onClick={onAsk}><Bot size={16} />Ask agent</button><button className="primary" onClick={onChecklist}><ClipboardCheck size={16} />Open checklist</button></div></section>
    <div className="detail-grid"><section className="detail-main">
      <div className="panel phase-card"><div className="panel-head"><div><span className="eyebrow">CURRENT POSITION</span><h2>{p.phase}</h2></div><strong>{p.progress}%</strong></div><div className="big-progress"><i style={{ width: `${p.progress}%` }} /></div><div className="phase-labels"><span>Stage 1</span><span>Stage 2</span><span>Stage 3</span><span>Monitoring</span><span>Complete</span></div></div>
      <div className="panel detail-card"><div className="panel-head"><div><span className="eyebrow">CURRENT VISIT</span><h2>{p.visits[0].name}</h2></div><span className="visit-status"><i />{p.visits[0].status}</span></div><div className="visit-meta"><span><CalendarDays size={15} />{p.visits[0].date}</span><span><Clock3 size={15} />{p.visits[0].time}</span><span>Timing: {p.visits[0].window}</span></div><div className="compact-tasks">{p.tasks.slice(0, 5).map((task) => <div key={task.id}>{task.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}<span>{task.title}</span><small>{task.due}</small></div>)}</div><button className="text-button" onClick={onChecklist}>View complete checklist <ArrowRight size={14} /></button></div>
    </section><aside className="detail-aside">
      <div className="panel stat-stack"><div><span>Tasks complete</span><strong>{completed}<small> / {p.tasks.length}</small></strong></div><div><span>Assessments due</span><strong>{p.assessments.filter((a) => a.status === 'Due').length}</strong></div><div><span>Samples due</span><strong>{p.samples.filter((s) => s.status === 'Due').length}</strong></div></div>
      <div className="panel next-action-card"><span className="eyebrow">NEXT BEST ACTION</span><h3>{nextTask?.title ?? 'Review stage readiness'}</h3><p>{nextTask ? `${nextTask.due} · ${nextTask.category}` : 'All checklist tasks are complete.'}</p><button onClick={onChecklist}>Open this visit <ArrowRight size={14} /></button><button className="secondary-action" onClick={onReadiness}>Explain readiness</button></div>
      <div className="panel context-card"><span className="eyebrow">SHARED CONTEXT</span><h3>Coordinator and agent see the same state</h3>{['Workflow stage and visits', 'Required assessments', 'Sample schedule', 'Task completion and activity'].map((item) => <p key={item}><Check size={13} />{item}</p>)}<small>No direct identifiers or real PHI.</small></div>
    </aside></div></>;
}

function WorkflowBuilder({ draft, saveState, onBack, onChange, onSave, onPublish }: { draft: WorkflowDraft; saveState: 'ready' | 'saving' | 'saved' | 'error'; onBack: () => void; onChange: (draft: WorkflowDraft) => void; onSave: () => void; onPublish: () => void }) {
  const [selectedStageId, setSelectedStageId] = useState(draft.stages[0]?.id ?? '');
  const updateStage = (id: string, patch: Partial<WorkflowStage>) => onChange({ ...draft, stages: draft.stages.map((stage) => stage.id === id ? { ...stage, ...patch } : stage) });
  const focusStage = (id: string, focusInput = false) => {
    setSelectedStageId(id);
    window.setTimeout(() => {
      const stage = document.getElementById('selected-stage-editor');
      stage?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (focusInput) stage?.querySelector<HTMLInputElement>('input')?.focus();
    }, 0);
  };
  const addStage = () => {
    const id = `stage-${Date.now()}-${draft.stages.length + 1}`;
    onChange({ ...draft, stages: [...draft.stages, { id, name: `Stage ${draft.stages.length + 1}`, window: '', visits: 1, tasks: 1, assessments: 1, samples: 0, gates: ['tasks'] }] });
    focusStage(id, true);
  };
  const removeStage = (id: string) => {
    if (draft.stages.length <= 2) return;
    const index = draft.stages.findIndex((stage) => stage.id === id);
    const nextStages = draft.stages.filter((stage) => stage.id !== id);
    onChange({ ...draft, stages: nextStages });
    if (selectedStageId === id) setSelectedStageId(nextStages[Math.min(index, nextStages.length - 1)]?.id ?? '');
  };
  const moveStage = (id: string, direction: -1 | 1) => {
    const index = draft.stages.findIndex((stage) => stage.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= draft.stages.length) return;
    const stages = [...draft.stages];
    [stages[index], stages[nextIndex]] = [stages[nextIndex], stages[index]];
    onChange({ ...draft, stages });
    setSelectedStageId(id);
  };
  const toggleGate = (stage: WorkflowStage, gate: WorkflowGate) => updateStage(stage.id, { gates: stage.gates.includes(gate) ? stage.gates.filter((item) => item !== gate) : [...stage.gates, gate] });
  const totals = draft.stages.reduce((sum, stage) => ({ visits: sum.visits + stage.visits, tasks: sum.tasks + stage.tasks, assessments: sum.assessments + stage.assessments, samples: sum.samples + stage.samples }), { visits: 0, tasks: 0, assessments: 0, samples: 0 });
  const valid = draft.protocolCode.trim().length > 0 && draft.name.trim().length > 0 && draft.stages.length >= 2 && draft.stages.every((stage) => stage.name.trim() && stage.gates.length > 0);
  const selectedStage = draft.stages.find((stage) => stage.id === selectedStageId) ?? draft.stages[0];
  const selectedStageIndex = draft.stages.findIndex((stage) => stage.id === selectedStage?.id);

  return <><button className="back-button" onClick={onBack}><ArrowLeft size={15} />Workflow overview</button><PageHeading eyebrow={`WORKFLOW · ${draft.status.toUpperCase()}`} title="Build the workflow" subtitle="Create flexible phases for any study or program, then define activities and completion criteria." action={<div className="builder-actions"><button onClick={onSave} disabled={!valid || saveState === 'saving'}><Save size={15} />{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save draft'}</button><button className="publish" onClick={onPublish} disabled={!valid || saveState === 'saving'}><Rocket size={15} />Publish workflow</button></div>} />
    {saveState === 'error' && <div className="builder-alert"><AlertCircle size={15} />The workflow could not be loaded or saved. Your current edits remain visible.</div>}
    <section className="builder-layout"><div className="builder-main">
      <div className="panel workflow-details"><div className="panel-head"><div><span className="eyebrow">WORKFLOW DETAILS</span><h2>Name the operating model</h2></div><span className={`draft-state ${draft.status}`}>{draft.status}</span></div><div className="builder-fields"><label><span>Workflow ID</span><input value={draft.protocolCode} onChange={(event) => onChange({ ...draft, protocolCode: event.target.value.toUpperCase() })} /></label><label><span>Workflow name</span><input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label><label className="wide"><span>Purpose</span><textarea rows={2} value={draft.objective} onChange={(event) => onChange({ ...draft, objective: event.target.value })} /></label></div></div>
      <section className="panel workflow-canvas-builder"><header><div><span className="eyebrow">VISUAL WORKFLOW</span><h2>See the path as it comes together</h2><p>Select a stage to edit it or use the arrows to change its position.</p></div><button className="canvas-add-button" onClick={addStage}><Plus size={14} />Add stage</button></header><div className="canvas-track">{draft.stages.map((stage, index) => <div className="canvas-item" key={stage.id}><button className={`canvas-stage ${selectedStage?.id === stage.id ? 'selected' : ''}`} onClick={() => focusStage(stage.id)}><span className="canvas-number">{index + 1}</span><strong>{stage.name || 'Untitled stage'}</strong><small>{stage.window || 'Flexible timing'}</small><span className="canvas-counts"><i>{stage.visits} visits</i><i>{stage.tasks} tasks</i></span></button><div className="canvas-order"><button onClick={() => moveStage(stage.id, -1)} disabled={index === 0} aria-label={`Move ${stage.name} left`}><ArrowLeft size={13} /></button><button onClick={() => moveStage(stage.id, 1)} disabled={index === draft.stages.length - 1} aria-label={`Move ${stage.name} right`}><ArrowRight size={13} /></button></div>{index < draft.stages.length - 1 && <ArrowRight className="canvas-connector" size={20} />}</div>)}</div></section>
      {selectedStage && <article className="panel stage-form selected" id="selected-stage-editor"><header><span className="stage-index">{selectedStageIndex + 1}</span><div className="stage-title"><span className="eyebrow">EDITING STAGE</span><strong>{selectedStage.name || 'Untitled stage'}</strong><small>Select another stage from the visual workflow above.</small></div><div className="stage-card-actions"><button onClick={() => removeStage(selectedStage.id)} disabled={draft.stages.length <= 2} aria-label={`Remove ${selectedStage.name}`} title={draft.stages.length <= 2 ? 'A workflow needs at least two stages' : `Remove ${selectedStage.name}`}><Trash2 size={14} /></button></div></header><div className="stage-fields"><label><span>Stage name</span><input value={selectedStage.name} onChange={(event) => updateStage(selectedStage.id, { name: event.target.value })} /></label><label><span>Timing, cadence, or trigger (optional)</span><input placeholder="Week 1, monthly, after approval, or as needed" value={selectedStage.window} onChange={(event) => updateStage(selectedStage.id, { window: event.target.value })} /></label></div><div className="requirement-counts">{(['visits', 'tasks', 'assessments', 'samples'] as const).map((field) => <label key={field}><span>{field}</span><input type="number" min="0" value={selectedStage[field]} onChange={(event) => updateStage(selectedStage.id, { [field]: Math.max(0, Number(event.target.value)) })} /></label>)}</div><div className="gate-row"><span>Completion criteria</span><div>{(['tasks', 'assessments', 'samples'] as WorkflowGate[]).map((gate) => <button key={gate} className={selectedStage.gates.includes(gate) ? 'active' : ''} aria-pressed={selectedStage.gates.includes(gate)} onClick={() => toggleGate(selectedStage, gate)}>{selectedStage.gates.includes(gate) && <Check size={12} />}{gate}</button>)}</div></div></article>}
    </div><aside className="builder-aside"><div className="panel builder-overview"><span className="eyebrow">WORKFLOW SUMMARY</span><div className="overview-readiness"><span className={valid ? 'ready' : ''}>{valid ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}</span><div><strong>{valid ? 'Ready to publish' : 'Needs attention'}</strong><p>{valid ? 'Every stage has a name and completion criteria.' : 'Complete the selected stage before publishing.'}</p></div></div><div className="overview-totals"><span><b>{draft.stages.length}</b> stages</span><span><b>{totals.visits}</b> visits</span><span><b>{totals.tasks}</b> tasks</span><span><b>{totals.assessments}</b> assessments</span><span><b>{totals.samples}</b> samples</span></div><small>Publishing makes these stage gates the live rules used by subject checklists, readiness reports, and agent actions.</small></div></aside></section>
  </>;
}

function ProtocolWorkflow({ draft, onEdit }: { draft: WorkflowDraft; onEdit: () => void }) {
  const colors = ['purple', 'blue', 'green', 'amber', 'slate'];
  const touchpoints = draft.stages.reduce((sum, stage) => sum + stage.visits, 0);
  return <><PageHeading eyebrow={`${draft.protocolCode} · VERSION ${draft.version} · OPERATIONS LIVE`} title="Workflow map" subtitle={draft.objective} action={<button className="assistant-button" onClick={onEdit}><Plus size={16} />Edit workflow</button>} />
    <section className="panel protocol-summary"><div><span>Workflow</span><strong>{draft.protocolCode}</strong></div><div><span>Status</span><strong>{draft.status === 'published' ? 'Published' : 'Draft changes'}</strong></div><div><span>Active subjects</span><strong>3 synthetic records</strong></div><div><span>Workflow scope</span><strong>{touchpoints} planned touchpoints</strong></div></section>
    <section className="panel workflow-panel"><div className="panel-head"><div><span className="eyebrow">STRUCTURED WORKFLOW LOGIC</span><h2>Subject journey</h2></div></div><div className="workflow-track">{draft.stages.map((stage, index) => <div className="workflow-node" key={stage.id}><div className={`phase-orb ${colors[index % colors.length]}`}>{index + 1}</div><div><small>{stage.window || 'Flexible timing'}</small><h3>{stage.name}</h3><p>{stage.visits} visit{stage.visits !== 1 ? 's' : ''} · {stage.assessments} assessments</p></div>{index < draft.stages.length - 1 && <ArrowRight size={20} />}</div>)}</div></section>
    <div className="protocol-grid">{draft.stages.slice(0, 4).map((stage, index) => <article className="panel phase-detail" key={stage.id}><span className={`phase-dot ${colors[index % colors.length]}`} /><h3>{stage.name}</h3><p>{stage.window || 'Flexible timing'}</p><div><span>{stage.visits} required visit{stage.visits !== 1 ? 's' : ''}</span><span>{stage.tasks} task rules · {stage.assessments} assessments</span><span>Criteria: {stage.gates.join(', ')}</span></div></article>)}</div></>;
}

function Checklist({ participant: p, workflow, activityLog, onParticipantChange, onComplete, onAsk, onAdvance, onAdvanceStage }: { participant: Participant; workflow: WorkflowDraft; activityLog: ActivityEntry[]; onParticipantChange: (id: Participant['id']) => void; onComplete: (taskId: string) => void; onAsk: () => void; onAdvance: () => void; onAdvanceStage: () => void }) {
  const complete = p.tasks.filter((task) => task.completed).length;
  const percent = p.tasks.length ? Math.round((complete / p.tasks.length) * 100) : 100;
  const operational = getOperationalContext(p, workflow);
  const isReady = operational.ready;
  return <><PageHeading eyebrow="LIVE VISIT WORKSPACE" title={`${p.id} · ${p.visits[0].name}`} subtitle="A published-workflow checklist shared by the coordinator and agent." action={<div className="heading-actions"><div className="participant-switcher">{initialParticipants.map((item) => <button key={item.id} className={item.id === p.id ? 'active' : ''} onClick={() => onParticipantChange(item.id)}>{item.id}</button>)}</div><button className="ask-compact" onClick={onAsk}><Bot size={14} />Ask about this visit</button></div>} />
    <section className="checklist-layout"><div className="panel checklist-panel"><div className="workflow-source"><span className="source-icon"><Workflow size={18} /></span><div><small>GENERATED FROM PUBLISHED WORKFLOW</small><strong>{workflow.protocolCode} v{workflow.version} · {operational.stage.name}</strong></div><span className="source-gates">Gates: {operational.gates.join(' + ')}</span></div><div className="checklist-progress"><div><span className="eyebrow">VISIT COMPLETION</span><h2>{complete} of {p.tasks.length} tasks complete</h2></div><strong>{percent}%</strong></div><div className="big-progress"><i style={{ width: `${percent}%` }} /></div>
      <div className="checklist-items">{p.tasks.map((task, index) => <article className={`checklist-item ${task.completed ? 'done' : ''}`} key={task.id}><span className="step-number">{task.completed ? <Check size={15} /> : index + 1}</span><div><span className="task-category">{task.category}</span><h3>{task.title}</h3><p>{task.due} · {task.required ? 'Required' : 'Optional'} · ID {task.id}</p></div>{task.completed ? <span className="completed-meta"><CheckCircle2 size={15} />{task.completedAt}</span> : <button onClick={() => onComplete(task.id)}>Mark complete</button>}</article>)}</div></div>
      <aside className="checklist-aside"><div className="panel readiness-card"><div className="readiness-icon"><ShieldCheck size={21} /></div><span className="eyebrow">STAGE READINESS · {operational.stage.name.toUpperCase()}</span><h2>{isReady ? 'Ready to advance' : 'Completion criteria pending'}</h2><div className="readiness-breakdown">{(['tasks', 'assessments', 'samples'] as WorkflowGate[]).map((gate) => <span className={operational.gates.includes(gate) ? 'active-gate' : 'informational-gate'} key={gate}><b>{operational.remaining[gate]}</b>{gate}<small>{operational.gates.includes(gate) ? 'Required gate' : 'Informational'}</small></span>)}</div><p>Published workflow v{workflow.version} requires {operational.gates.join(', ')} before {p.id} can move to {p.nextPhase}.</p><button onClick={isReady ? onAdvanceStage : onAdvance}>{isReady ? 'Advance to next stage' : 'Explain what’s blocking'}<ArrowRight size={15} /></button></div><div className="panel audit-card"><span className="eyebrow">ACTIVITY TRAIL</span><h3>Changes stay visible</h3><div className="audit-list">{activityLog.slice(0, 5).map((entry) => <div key={entry.id}><i className={entry.actor.toLowerCase()}>{entry.actor === 'Agent' ? <Sparkles size={12} /> : <UserRound size={12} />}</i><span><b>{entry.action}</b><small>{entry.actor} · {entry.time}</small></span></div>)}</div></div></aside>
    </section></>;
}

function AssistantPanel({ selectedId, webMcpStatus, toolRuns, messages, input, onInput, onSubmit, onClose, onStatus, onChecklist, onAssessments, onSamples, onAdvance, onAdvanceStage }: { selectedId: Participant['id']; webMcpStatus: WebMcpStatus; toolRuns: ToolRun[]; messages: AssistantMessage[]; input: string; onInput: (value: string) => void; onSubmit: () => void; onClose: () => void; onStatus: () => void; onChecklist: () => void; onAssessments: () => void; onSamples: () => void; onAdvance: () => void; onAdvanceStage: () => void }) {
  const latest = useMemo(() => messages.slice(-6), [messages]);
  const statusLabel = webMcpStatus === 'connected' ? 'Connected to this workspace' : webMcpStatus === 'checking' ? 'Connecting to this workspace' : 'Built-in demo controls active';
  const connectionLabel = webMcpStatus === 'connected' ? 'live' : webMcpStatus === 'checking' ? 'connecting' : 'demo';
  return <aside className="assistant-drawer" aria-label="ProtocolOS agent workspace"><header><div className="agent-title"><span><Bot size={18} /></span><div><strong>Agent workspace</strong><small className={webMcpStatus}><i />{statusLabel}</small></div></div><button onClick={onClose} aria-label="Close agent workspace"><X size={18} /></button></header>
    <div className="assistant-context"><span>Current workspace</span><strong>{selectedId}</strong><small>Agent actions and visible results appear below</small></div>
    <details className="integration-details"><summary>Integration details</summary><p>Powered by WebMCP. ProtocolOS shares structured, permissioned actions with compatible browser agents.</p></details>
    <section className="session-console"><header><div><span>AGENT ACTIONS</span><strong>{toolRuns.length ? `${toolRuns.length} action${toolRuns.length === 1 ? '' : 's'}` : 'Waiting for agent'}</strong></div><span className={`connection-badge ${webMcpStatus}`}><i />{connectionLabel}</span></header>{toolRuns.length ? <div className="tool-run-list">{toolRuns.slice(0, 5).map((run) => <article className={run.status} key={run.id}><span className="run-icon">{run.status === 'completed' ? <Check size={13} /> : run.status === 'blocked' ? <ShieldCheck size={13} /> : <AlertCircle size={13} />}</span><div><strong>{run.title}</strong><p>{run.summary}</p><small>{run.subjectId ? `${run.subjectId} · ` : ''}{run.access === 'read' ? 'Read-only' : 'State-changing'} · {run.time}</small><details className="run-receipt"><summary>Technical receipt</summary><code>{run.tool}</code></details></div>{run.uiChanged && <span className="ui-updated">UI updated</span>}</article>)}</div> : <div className="session-empty"><Sparkles size={17} /><div><strong>Ask your connected agent to use ProtocolOS</strong><p>Try: “What does SUB001 need today?”</p></div></div>}</section>
    <div className="quick-actions"><button onClick={onStatus}><AlertCircle size={13} />What’s next?</button><button onClick={onChecklist}><ClipboardCheck size={13} />Checklist</button><button onClick={onAssessments}><MessageSquareText size={13} />Assessments</button><button onClick={onSamples}><FlaskConical size={13} />Samples</button><button onClick={onAdvance}><ShieldCheck size={13} />Readiness</button></div>
    <div className="message-list">{latest.map((message) => <div className={`message ${message.role}`} key={message.id}>{message.role === 'agent' && <span className="message-avatar"><Sparkles size={13} /></span>}<div><p>{message.text}</p>{message.meta && <small>{message.meta}</small>}{message.actions && <div className="message-actions">{message.actions.includes('checklist') && <button onClick={onChecklist}><ClipboardCheck size={14} />Open checklist</button>}{message.actions.includes('assessments') && <button onClick={onAssessments}><MessageSquareText size={14} />Assessments</button>}{message.actions.includes('samples') && <button onClick={onSamples}><FlaskConical size={14} />Samples</button>}{message.actions.includes('advance') && <button onClick={onAdvance}><ShieldCheck size={14} />Explain readiness</button>}{message.actions.includes('advance-stage') && <button onClick={onAdvanceStage}><ArrowRight size={14} />Advance stage</button>}</div>}</div></div>)}</div>
    <div className="suggested-prompts"><span>SUGGESTED</span><button onClick={onStatus}><Play size={11} />What should {selectedId} do next?</button></div>
    <form className="assistant-input" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><input value={input} onChange={(event) => onInput(event.target.value)} placeholder="Ask about a Subject ID…" aria-label="Ask ProtocolOS" /><button type="submit" aria-label="Send"><Send size={15} /></button></form><footer><LockKeyhole size={11} />Synthetic subject data only · no PHI</footer>
  </aside>;
}
