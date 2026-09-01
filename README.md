# ProtocolOS

ProtocolOS turns a complex workflow into a shared, structured workspace for operations teams and browser agents. The MVP was created for the OpenAI WebMCP Challenge and uses generic synthetic Subject IDs only—never real protected health information (PHI).

**Live demo:** [protocolos-webmcp.christian-lopez-1.chatgpt.site](https://protocolos-webmcp.christian-lopez-1.chatgpt.site/)

Challenge submission copy, judge testing steps, and the timed demo narration are available in [SUBMISSION.md](./SUBMISSION.md).

## Why WebMCP

Research operations are usually fragmented across long protocol documents, spreadsheets, calendars, and disconnected task systems. A browser agent that only sees pixels has to infer the study model and risks missing completion rules. ProtocolOS exposes the study's actual entities and safe actions as WebMCP tools, while keeping every change visible in the coordinator interface.

People can review Subject IDs, workflow stages, visits, assessments, samples, and tasks. Their agent can retrieve the same structured context, create a checklist, complete an item, and ask ProtocolOS to enforce the stage-transition guardrail.

The product interface leads with operational language—agent actions, readiness, checklists, and outcomes—rather than implementation terminology. WebMCP remains available in an optional integration disclosure and per-action technical receipts so judges and developers can verify the connection without burdening everyday users.

## MVP features

- Operations dashboard and today's priorities
- Functional global search across subjects, visits, and tasks
- Subject ID list and detailed subject workspace
- Guided workflow builder for flexible stages, optional timing or cadence, requirements, and completion criteria
- Saved workflow drafts and published versions backed by durable platform storage
- Live workflow map generated from the published definition
- Workflow-derived visit checklist with visible task mutations
- Context-aware operations copilot with subject-specific quick actions
- Shared human-and-agent activity trail
- Read-only readiness reports separated from guarded stage advancement
- Synthetic SUB001, SUB002, and SUB003 subject records
- Local demo-state persistence and one-click reset
- Responsive layout and explicit synthetic-data / no-PHI labels

## WebMCP tools

The application registers fourteen imperative tools with `document.modelContext.registerTool()`:

| Tool | Behavior |
| --- | --- |
| `get_today_priorities` | Returns the ordered daily workload and next required action per subject. |
| `get_study_portfolio` | Returns every study, status, enrollment summary, open actions, and next milestone. |
| `get_protocol_workflow` | Returns the saved workflow definition, stages, requirement counts, and gates. |
| `update_protocol_stage` | Updates a stage draft and opens the builder for human review. |
| `publish_protocol_workflow` | Publishes a reviewed draft for the workflow map and agent. |
| `get_participant_status` | Returns current phase, visit, progress, and task counts. |
| `get_required_assessments` | Lists workflow-required assessments and their status. |
| `get_upcoming_visits` | Returns in-progress and scheduled visits with timing and status. |
| `get_sample_schedule` | Returns synthetic sample collection and processing requirements. |
| `check_missing_tasks` | Finds incomplete required tasks and determines visit-close readiness. |
| `get_readiness_report` | Explains readiness and blockers without changing workflow state. |
| `create_visit_checklist` | Creates and visibly opens an ordered subject checklist. |
| `mark_task_complete` | Completes a synthetic task and immediately updates the shared UI. |
| `advance_study_phase` | Advances only when tasks, assessments, and samples satisfy the workflow gate. |

Read tools include `readOnlyHint: true`. Mutating tools include `readOnlyHint: false`, update the visible application state, and return structured results. Tool registrations use an `AbortSignal` for lifecycle cleanup, following the current WebMCP imperative API.

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. For native WebMCP testing, use ChatGPT's in-app browser or enable `chrome://flags/#enable-webmcp-testing` in a supported Chrome build.

Create a production build with:

```bash
npm run build
```

## Three-minute challenge demo

Start from the dashboard and click **Reset challenge demo** if the app has been used before.

1. Open **Ask ProtocolOS** and ask: **“What does SUB001 need to complete today?”**
   - The agent combines participant status, missing tasks, and sample schedule.
   - Point out that the result is structured workflow context, not visual browser guessing.
2. Ask: **“Create the visit checklist.”**
   - ProtocolOS opens Subject ID SUB001's ordered checklist in the shared workspace.
   - The coordinator can see exactly what the agent created.
3. Mark **Complete Assessment A** complete, either from the visible checklist or with `mark_task_complete` using task ID `T-001-3`.
   - The task and assessment status update immediately.
4. Ask: **“Can SUB001 advance to the next phase?”**
   - `get_readiness_report` checks tasks, assessments, and samples without changing the workflow.
   - It explains why SUB001 is not ready and recommends the next required action.
5. Close on the human-agent value: the agent accelerates coordination, while the person sees the state change and the workflow—not the model—decides whether advancement is allowed.

## Challenge submission checklist

- Working live URL accessible in ChatGPT's in-app browser or WebMCP-enabled Chrome
- Public repository containing this source, the MIT license, and setup instructions
- Text description covering WebMCP fit, improved UX, new human-agent collaboration, and implementation
- Public narrated YouTube demo under three minutes

## Safety and data

Every person, protocol, sponsor, date, result, and workflow in this repository is fictional. ProtocolOS is a hackathon prototype, not a clinical system and not medical advice. It does not include authentication, validated clinical decision support, audit-grade persistence, or regulatory controls required for real research use.

## License

MIT — see [LICENSE](./LICENSE).
