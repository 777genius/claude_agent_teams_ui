import { join } from 'path';

export class MemberWorkSyncStorePaths {
  constructor(private readonly teamsBasePath: string) {}

  getTeamDir(teamName: string): string {
    return join(this.teamsBasePath, teamName, '.member-work-sync');
  }

  getStatusPath(teamName: string): string {
    return join(this.getTeamDir(teamName), 'status.json');
  }

  getPendingReportsPath(teamName: string): string {
    return join(this.getTeamDir(teamName), 'pending-reports.json');
  }

  getReportTokenSecretPath(teamName: string): string {
    return join(this.getTeamDir(teamName), 'report-token-secret.json');
  }
}
