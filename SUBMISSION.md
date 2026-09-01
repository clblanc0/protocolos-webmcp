# ProtocolOS — WebMCP Challenge Submission

## Tagline

Turn complex study protocols into shared, agent-ready operational workflows.

## Project description

Research operations rarely live in one place. Protocol requirements are distributed across documents, spreadsheets, calendars, task lists, and data systems. Coordinators must continually reconcile those sources to determine what each subject needs, what is missing, and whether a workflow can safely move forward.

ProtocolOS turns a protocol into a structured workspace shared by people and browser agents. It organizes multiple synthetic studies, subjects, stages, visits, assessments, samples, tasks, and completion criteria. A coordinator can see the same operational state that an agent uses, review every action, and retain control of workflow transitions.

All records are fictional and use generic identifiers such as SUB001. The prototype contains no real protected health information.

## Why this is a strong fit for WebMCP

Without WebMCP, an agent would have to infer research state from pixels and page text. That is fragile for workflows where a missed assessment, sample, or sign-off can change whether a visit is complete.

ProtocolOS exposes structured, task-oriented actions directly from the live application. The agent can retrieve subject status, compare studies, inspect the published workflow, find missing requirements, create a visit checklist, complete an approved task, and request a guarded stage transition. Each action returns structured results tied to the same state shown in the interface.

This is more than browser navigation. WebMCP becomes the operational contract between the human-facing workspace and the agent.

## How it creates a better experience

The coordinator can ask a natural question such as “What does SUB001 need today?” instead of manually opening several systems and reconciling them. ProtocolOS returns the current stage, visit, incomplete tasks, assessments, sample requirements, and the next required action.

When the agent creates a checklist or completes a task, the visible workspace updates immediately. The activity trail identifies the actor, the change, and the time. Read-only readiness checks remain separate from state-changing advancement, and the published workflow—not the model—decides whether advancement is allowed.

## What people and agents can do together

The agent handles retrieval, synthesis, checklist creation, and routine updates. The coordinator sees the result, reviews state-changing actions, and makes judgment calls. Together they can move from a protocol-level rule to the correct next action for a specific subject without losing visibility or control.

The demonstration shows this collaboration end to end:

1. Retrieve what SUB001 needs today.
2. Generate the visit checklist from the published workflow.
3. Mark Assessment A complete and synchronize the related assessment record.
4. Ask whether SUB001 can advance.
5. Receive a blocked decision with explicit remaining tasks, assessments, and samples.

## How WebMCP was implemented

ProtocolOS registers fourteen imperative tools with `document.modelContext.registerTool()`. Read operations use `readOnlyHint: true`; mutations use `readOnlyHint: false`. Tool calls return structured content, synthetic-data indicators, workflow provenance, and a compact technical receipt. Mutating actions update the React application state so the human interface and the agent remain synchronized.

The tools cover portfolio summaries, priorities, workflow inspection and publishing, subject status, assessments, visits, samples, missing tasks, readiness, checklist creation, task completion, and guarded stage advancement.

## Judge testing instructions

1. Open the live ProtocolOS URL in ChatGPT’s in-app browser or a WebMCP-enabled version of Chrome.
2. Open the **Agent workspace** in ProtocolOS.
3. Ask: **“What does SUB001 need today?”**
4. Ask: **“Create SUB001’s visit checklist.”**
5. Ask: **“Mark task T-001-3 complete for SUB001.”**
6. Ask: **“Can SUB001 advance to the next stage?”**
7. Confirm that the checklist updates from 29% to 43%, Assessment A becomes complete, the activity trail shows the agent action, and advancement is blocked with explicit remaining requirements.

If the demo has already been used, select **Reset challenge demo** before beginning.

## Three-minute video script

### 0:00–0:25 — The problem

“Research protocols describe exactly what must happen, but operations are usually spread across documents, spreadsheets, calendars, and task systems. Coordinators spend valuable time reconciling those sources, and a browser agent that only sees pixels has to guess what the workflow means.”

### 0:25–0:45 — The product

“ProtocolOS turns the protocol into a shared operational workspace. It organizes multiple studies, synthetic subject IDs, stages, visits, assessments, samples, tasks, and completion rules. The interface is built for people, while WebMCP gives an agent structured access to the same state.”

### 0:45–1:15 — Ask what is needed

“I’ll ask what SUB001 needs today. The agent retrieves the subject’s current stage and visit, identifies five open tasks, and understands that tasks, assessments, and samples are all required gates. It is reading structured workflow state rather than interpreting the screen.”

### 1:15–1:40 — Create the checklist

“Next, I’ll ask it to create the visit checklist. ProtocolOS opens the checklist generated from the published workflow. The coordinator can see every required item and the exact completion rule the agent used.”

### 1:40–2:05 — Complete one task

“Now the agent marks Assessment A complete. The visible checklist moves from 29 to 43 percent, the assessment record synchronizes, and the activity trail records that the agent made the change. Humans and agents are working in one shared state.”

### 2:05–2:35 — Demonstrate the guardrail

“Finally, I’ll ask whether SUB001 can advance. ProtocolOS checks the published completion gates and blocks advancement. It explains the remaining tasks, assessment, and samples, then identifies the next required action. The model does not decide whether the subject advances—the workflow does.”

### 2:35–2:55 — Close

“ProtocolOS shows what becomes possible when a protocol is no longer just a document. Agents accelerate coordination, people retain visibility and judgment, and the workflow provides a reliable operational contract. Every record shown here is synthetic, with no real PHI.”

## Final submission checklist

- [x] Working ProtocolOS build
- [x] Public judge-accessible live Site
- [x] Fourteen working WebMCP actions
- [x] Synthetic data and no-PHI disclosures
- [x] Open-source MIT license
- [x] Local setup and testing instructions
- [x] Public GitHub repository: https://github.com/clblanc0/protocolos-webmcp
- [ ] Public YouTube demo under three minutes
- [ ] Devpost submission fields completed
- [x] Final signed-out judge-access test
- [ ] Freeze submitted Site, repository, and Devpost entry during judging
