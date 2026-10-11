import type { TestTarget } from '@/automation/platform/target';
import type { ExecutionStep, RunArtifact, RunStatus } from '@/features/runs/types';

export const issueStatuses = {
  open: '待确认',
  in_progress: '处理中',
  pending_verification: '待验证',
  closed: '已关闭',
};
export const issueCategories = {
  product: '产品缺陷',
  test: '用例问题',
  environment: '环境问题',
  execution: '执行系统问题',
};
export const issueSeverities = { critical: '阻断', high: '严重', medium: '一般', low: '轻微' };
export const closeReasons = {
  fixed: '已修复',
  dismissed: '不予处理',
  duplicate: '重复问题',
  unreproducible: '无法复现',
};
export type IssueStatus = keyof typeof issueStatuses;
export type Issue = {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  category: keyof typeof issueCategories;
  severity: keyof typeof issueSeverities;
  closeReason: keyof typeof closeReasons | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  runCount?: number;
  lastSeen?: string;
  firstSeen?: string;
  latestOccurrence?: IssueOccurrence | null;
  runOccurrences?: IssueOccurrence[];
};
export type OccurrenceSnapshot = {
  name: string;
  goal: string;
  url: string;
  testId?: string;
  target?: TestTarget;
  environment?: Record<string, unknown>;
  step?: ExecutionStep;
  artifacts: RunArtifact[];
  error?: string;
  nodeGoal?: string;
  runStatus?: RunStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  reproduction?: string[];
};
export type IssueOccurrence = {
  id: string;
  issueId: string;
  runId: string;
  stepId: string | null;
  snapshot: OccurrenceSnapshot;
  createdAt: string;
};
export type IssueEvent = {
  id: string;
  issueId: string;
  kind: 'created' | 'updated' | 'comment' | 'occurrence' | 'verification';
  message: string;
  createdAt: string;
};
export type VerificationOutcome = 'pending' | 'passed' | 'failed' | 'inconclusive';
export const verificationLabels = {
  pending: '验证中',
  passed: '目标验证通过',
  failed: '目标验证失败',
  inconclusive: '无法验证',
};
export type IssueVerification = {
  id: string;
  issueId: string;
  runId: string;
  occurrenceId: string;
  createdAt: string;
  outcome: VerificationOutcome;
  explanation: string;
  runStatus: RunStatus;
};
export type IssueDetail = {
  issue: Issue;
  occurrences: IssueOccurrence[];
  events: IssueEvent[];
  verifications: IssueVerification[];
};
export type IssuePage = { issues: Issue[]; nextCursor: string | null };
