export type WorkflowGate = 'tasks' | 'assessments' | 'samples';

export type WorkflowStage = {
  id: string;
  name: string;
  window: string;
  visits: number;
  tasks: number;
  assessments: number;
  samples: number;
  gates: WorkflowGate[];
};

export type WorkflowDraft = {
  id: 'primary';
  protocolCode: string;
  name: string;
  objective: string;
  status: 'draft' | 'published';
  version: number;
  updatedAt: string;
  stages: WorkflowStage[];
};

export const defaultWorkflowDraft: WorkflowDraft = {
  id: 'primary',
  protocolCode: 'STUDY-01',
  name: 'Synthetic Study Workflow',
  objective: 'Coordinate subjects, visits, assessments, samples, and completion criteria in one structured workflow.',
  status: 'published',
  version: 1,
  updatedAt: '2026-08-30T18:00:00.000Z',
  stages: [
    { id: 'stage-1', name: 'Stage 1', window: 'At the start', visits: 1, tasks: 5, assessments: 4, samples: 1, gates: ['tasks', 'assessments'] },
    { id: 'stage-2', name: 'Stage 2', window: 'After the first stage', visits: 1, tasks: 6, assessments: 5, samples: 1, gates: ['tasks', 'assessments', 'samples'] },
    { id: 'stage-3', name: 'Stage 3', window: 'Recurring or as needed', visits: 4, tasks: 8, assessments: 8, samples: 2, gates: ['tasks', 'assessments', 'samples'] },
    { id: 'monitoring', name: 'Monitoring', window: 'Ongoing cadence', visits: 3, tasks: 4, assessments: 6, samples: 1, gates: ['tasks', 'assessments'] },
    { id: 'complete', name: 'Complete', window: 'When completion criteria are met', visits: 1, tasks: 2, assessments: 2, samples: 0, gates: ['tasks'] },
  ],
};
