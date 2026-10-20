// Public table exports for application code and Drizzle; schema modules import each other directly.
export { authUsers, authSessions, authAccounts, authVerifications } from './schema/auth';
export { teams, teamMembers, teamInvitations } from './schema/teams';
export { testCases } from './schema/test-cases';
export { testSuites, suiteRuns } from './schema/suites';
export {
  testRuns,
  runBrowserLogs,
  runSteps,
  runArtifacts,
  recordingVersions,
  automationRunEvents,
  runDetailVersions,
  submissionRequests,
  modelCalls,
} from './schema/runs';
export { automationResources } from './schema/scheduling';
export { automationBuilds } from './schema/builds';
export { realtimeOutbox } from './schema/realtime';
export { issues, issueOccurrences, issueVerifications } from './schema/issues';
export {
  notificationIntegrations,
  notificationEventRecords,
  notificationDeliveries,
  browserProviderIntegrations,
} from './schema/integrations';
export { pluginSettings } from './schema/plugins';
