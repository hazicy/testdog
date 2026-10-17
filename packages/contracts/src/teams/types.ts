export type TeamRole = 'admin' | 'member';
export type TeamWorkspace = {
  teams: { id: string; name: string; role: TeamRole }[];
  activeTeamId: string | null;
  members: { userId: string; name: string; email: string; role: TeamRole }[];
  invitations: { id: string; email: string; expiresAt: string }[];
};
