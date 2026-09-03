export type DeliveryStageState = 'planned' | 'active' | 'review' | 'complete' | 'paused';
export type DeliveryWorkItemType = 'epic' | 'story' | 'task' | 'bug' | 'spike' | 'decision';
export type DeliveryDecisionState = 'proposed' | 'accepted' | 'deferred' | 'superseded';

export interface DeliveryWorkflowState {
  id: string;
  label: string;
  description: string;
  color: string;
  wipLimit?: number;
}

export interface DeliveryPriority {
  id: string;
  label: string;
  description: string;
  color: string;
  interrupt: boolean;
}

export interface DeliveryStage {
  id: string;
  order: number;
  title: string;
  goal: string;
  state: DeliveryStageState;
  reviewGate: string;
}

export interface DeliveryWorkItem {
  id: string;
  title: string;
  summary: string;
  type: DeliveryWorkItemType;
  stageId: string;
  statusId: string;
  priorityId: string;
  labels: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
  blockedBy: string[];
  reviewRoutes?: string[];
  evidence?: { id: string; title: string; path: string }[];
  notes?: string[];
  updatedAt: string;
}

export interface DeliveryDecision {
  id: string;
  title: string;
  state: DeliveryDecisionState;
  decision: string;
  rationale: string;
  revisitWhen: string;
  relatedWorkItemIds: string[];
  updatedAt: string;
}

export interface DeliveryInterruptionRule {
  priorityId: string;
  action: string;
  examples: string[];
}

export interface DeliveryCheckpoint {
  id: string;
  day: string;
  outcome: string;
  stageIds: string[];
  reviewStop: boolean;
}

export interface DeliveryWindow {
  id: string;
  dayRange: string;
  title: string;
  checkpoints: DeliveryCheckpoint[];
}

export interface DeliveryPlan {
  schemaVersion: 'delivery-plan/v1';
  id: string;
  title: string;
  summary: string;
  lastUpdated: string;
  sourceLabel: string;
  currentStageId: string;
  workflow: DeliveryWorkflowState[];
  priorities: DeliveryPriority[];
  stages: DeliveryStage[];
  workItems: DeliveryWorkItem[];
  decisions: DeliveryDecision[];
  deliverySequence: {
    title: string;
    note: string;
    windows: DeliveryWindow[];
  };
  interruptionPolicy: {
    title: string;
    principle: string;
    rules: DeliveryInterruptionRule[];
  };
}
