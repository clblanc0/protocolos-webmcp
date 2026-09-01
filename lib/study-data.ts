export type Task = {
  id: string;
  title: string;
  category: 'Visit prep' | 'Assessment' | 'Sample' | 'Safety' | 'Documentation';
  due: string;
  required: boolean;
  completed: boolean;
  completedAt?: string;
};

export type Assessment = {
  id: string;
  name: string;
  window: string;
  status: 'Complete' | 'Due' | 'Upcoming';
  required: boolean;
};

export type Sample = {
  id: string;
  type: string;
  collection: string;
  processing: string;
  status: 'Collected' | 'Due' | 'Upcoming';
};

export type Visit = {
  id: string;
  name: string;
  date: string;
  time: string;
  window: string;
  status: 'In progress' | 'Scheduled' | 'Complete';
};

export type Participant = {
  id: 'SUB001' | 'SUB002' | 'SUB003';
  alias: string;
  protocol: string;
  phase: string;
  nextPhase: string;
  status: 'On track' | 'Needs attention' | 'Pending';
  enrolled: string;
  progress: number;
  nextVisit: string;
  lastActivity: string;
  visits: Visit[];
  assessments: Assessment[];
  samples: Sample[];
  tasks: Task[];
};

export type StudySummary = {
  id: 'STUDY-01' | 'STUDY-02' | 'STUDY-03';
  name: string;
  model: string;
  status: 'Active' | 'Planning' | 'Closing';
  activeSubjects: number;
  targetSubjects: number;
  openActions: number;
  nextMilestone: string;
  description: string;
  stages: string[];
};

export const studyPortfolio: StudySummary[] = [
  {
    id: 'STUDY-01',
    name: 'Synthetic Study Workflow',
    model: 'Longitudinal program',
    status: 'Active',
    activeSubjects: 3,
    targetSubjects: 12,
    openActions: 10,
    nextMilestone: 'Stage 3 review · Demo day',
    description: 'A flexible demonstration workflow for coordinated visits, assessments, samples, and completion criteria.',
    stages: ['Intake', 'Stage 2', 'Stage 3', 'Monitoring', 'Complete'],
  },
  {
    id: 'STUDY-02',
    name: 'Remote Monitoring Program',
    model: 'Decentralized program',
    status: 'Planning',
    activeSubjects: 0,
    targetSubjects: 20,
    openActions: 6,
    nextMilestone: 'Workflow review · This week',
    description: 'A synthetic remote workflow organized around onboarding, recurring check-ins, escalation, and closeout.',
    stages: ['Onboarding', 'Baseline', 'Recurring check-ins', 'Escalation', 'Closeout'],
  },
  {
    id: 'STUDY-03',
    name: 'Community Follow-up Study',
    model: 'Observational program',
    status: 'Active',
    activeSubjects: 8,
    targetSubjects: 18,
    openActions: 14,
    nextMilestone: 'Monthly follow-up · This week',
    description: 'A synthetic observational workflow with flexible outreach, follow-up, review, and completion timing.',
    stages: ['Eligibility', 'Enrollment', 'Follow-up', 'Review', 'Complete'],
  },
];

export const protocol = {
  id: 'STUDY-01',
  title: 'Synthetic Study Workflow',
  sponsor: 'Demo Program',
  version: 'Workflow v1.0 · 18 Aug 2026',
  objective: 'A generic demonstration workflow for coordinating subjects, visits, assessments, samples, and tasks.',
  phases: [
    { name: 'Stage 1', duration: 'Window 1', visits: 1, assessments: 4, color: 'purple' },
    { name: 'Stage 2', duration: 'Window 2', visits: 1, assessments: 5, color: 'blue' },
    { name: 'Stage 3', duration: 'Windows 3–6', visits: 4, assessments: 8, color: 'green' },
    { name: 'Monitoring', duration: 'Windows 7–9', visits: 3, assessments: 6, color: 'amber' },
    { name: 'Complete', duration: 'Study exit', visits: 1, assessments: 2, color: 'slate' },
  ],
};

export const initialParticipants: Participant[] = [
  {
    id: 'SUB001',
    alias: 'Subject 001',
    protocol: 'STUDY-01',
    phase: 'Stage 3 · Visit 04',
    nextPhase: 'Monitoring · Visit 07',
    status: 'Needs attention',
    enrolled: 'July 24, 2026',
    progress: 56,
    nextVisit: 'Today · 9:00 AM',
    lastActivity: 'Vitals recorded · 8:54 AM',
    visits: [
      { id: 'V-04', name: 'Visit 04', date: 'Synthetic demo day', time: '9:00 AM', window: 'Current visit window', status: 'In progress' },
      { id: 'V-06', name: 'Visit 06', date: 'In four weeks', time: '10:00 AM', window: 'Next cycle window', status: 'Scheduled' },
    ],
    assessments: [
      { id: 'A-001', name: 'Assessment A', window: 'At Visit 04', status: 'Due', required: true },
      { id: 'A-002', name: 'Assessment B', window: 'At Visit 04', status: 'Complete', required: true },
      { id: 'A-003', name: 'Assessment C', window: 'Before visit close', status: 'Due', required: true },
    ],
    samples: [
      { id: 'S-001', type: 'Sample A', collection: 'Visit 04 · Timepoint 1', processing: 'Process per workflow', status: 'Due' },
      { id: 'S-002', type: 'Sample B', collection: 'Visit 04 · Timepoint 1', processing: 'Route per workflow', status: 'Due' },
    ],
    tasks: [
      { id: 'T-001-1', title: 'Confirm visit window', category: 'Visit prep', due: 'Today · 8:45 AM', required: true, completed: true, completedAt: '8:42 AM' },
      { id: 'T-001-2', title: 'Complete Assessment B', category: 'Assessment', due: 'Today · 9:10 AM', required: true, completed: true, completedAt: '8:54 AM' },
      { id: 'T-001-3', title: 'Complete Assessment A', category: 'Assessment', due: 'Today · 9:20 AM', required: true, completed: false },
      { id: 'T-001-4', title: 'Collect Sample A', category: 'Sample', due: 'Today · 9:35 AM', required: true, completed: false },
      { id: 'T-001-5', title: 'Collect and route Sample B', category: 'Sample', due: 'Today · 9:45 AM', required: true, completed: false },
      { id: 'T-001-6', title: 'Complete Assessment C', category: 'Assessment', due: 'Before visit close', required: true, completed: false },
      { id: 'T-001-7', title: 'Complete visit sign-off', category: 'Documentation', due: 'Before stage advance', required: true, completed: false },
    ],
  },
  {
    id: 'SUB002',
    alias: 'Subject 002',
    protocol: 'STUDY-01',
    phase: 'Monitoring · Visit 07',
    nextPhase: 'Monitoring · Visit 09',
    status: 'On track',
    enrolled: 'June 10, 2026',
    progress: 78,
    nextVisit: 'Today · 11:30 AM',
    lastActivity: 'Assessment sync complete · Yesterday',
    visits: [{ id: 'V-07', name: 'Visit 07', date: 'Synthetic demo day', time: '11:30 AM', window: 'Current visit window', status: 'Scheduled' }],
    assessments: [
      { id: 'A-004', name: 'Assessment D', window: 'At Visit 07', status: 'Due', required: true },
      { id: 'A-005', name: 'Assessment E', window: 'Before visit', status: 'Complete', required: true },
    ],
    samples: [{ id: 'S-003', type: 'Sample C', collection: 'Visit 07', processing: 'Process per workflow', status: 'Upcoming' }],
    tasks: [
      { id: 'T-002-1', title: 'Review Assessment E', category: 'Assessment', due: 'Today · 11:35 AM', required: true, completed: true, completedAt: 'Yesterday' },
      { id: 'T-002-2', title: 'Complete Assessment D', category: 'Assessment', due: 'Today · 11:50 AM', required: true, completed: false },
      { id: 'T-002-3', title: 'Complete visit documentation', category: 'Documentation', due: 'Before visit close', required: true, completed: false },
    ],
  },
  {
    id: 'SUB003',
    alias: 'Subject 003',
    protocol: 'STUDY-01',
    phase: 'Stage 1 · Visit 01',
    nextPhase: 'Stage 2 · Visit 02',
    status: 'Pending',
    enrolled: 'Not yet enrolled',
    progress: 18,
    nextVisit: 'Today · 2:00 PM',
    lastActivity: 'Initial review complete · Yesterday',
    visits: [{ id: 'V-01', name: 'Visit 01', date: 'Synthetic demo day', time: '2:00 PM', window: 'Current visit window', status: 'Scheduled' }],
    assessments: [
      { id: 'A-006', name: 'Assessment F', window: 'Before workflow tasks', status: 'Due', required: true },
      { id: 'A-007', name: 'Assessment G', window: 'At Visit 01', status: 'Due', required: true },
    ],
    samples: [{ id: 'S-004', type: 'Sample D', collection: 'Visit 01', processing: 'Route per workflow', status: 'Upcoming' }],
    tasks: [
      { id: 'T-003-1', title: 'Confirm workflow entry', category: 'Documentation', due: 'Today · 2:05 PM', required: true, completed: false },
      { id: 'T-003-2', title: 'Complete Assessment F', category: 'Assessment', due: 'Today · 2:20 PM', required: true, completed: false },
      { id: 'T-003-3', title: 'Complete Assessment G', category: 'Assessment', due: 'Today · 2:30 PM', required: true, completed: false },
      { id: 'T-003-4', title: 'Collect Sample D', category: 'Sample', due: 'Today · 2:45 PM', required: true, completed: false },
      { id: 'T-003-5', title: 'Complete stage sign-off', category: 'Documentation', due: 'Before stage advance', required: true, completed: false },
    ],
  },
];
