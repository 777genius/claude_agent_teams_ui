import { describe, expect, it } from 'vitest';

import {
  getExpectedLatestMacArtifacts,
  getExpectedReleaseAssetUrl,
  getLatestMacMetadataUrl,
  isLatestMacMetadataCompatible,
  parseReleaseMetadataAssetNames,
} from '../../../../src/main/services/infrastructure/updaterReleaseMetadata';

describe('updaterReleaseMetadata', () => {
  it('builds platform-specific asset URLs', () => {
    expect(getExpectedReleaseAssetUrl('1.2.3', 'darwin', 'arm64')).toBe(
      'https://github.com/777genius/claude_agent_teams_ui/releases/download/v1.2.3/Claude.Agent.Teams.UI-1.2.3-arm64.dmg'
    );
    expect(getExpectedReleaseAssetUrl('1.2.3', 'darwin', 'x64')).toBe(
      'https://github.com/777genius/claude_agent_teams_ui/releases/download/v1.2.3/Claude.Agent.Teams.UI-1.2.3.dmg'
    );
    expect(getExpectedReleaseAssetUrl('1.2.3', 'win32', 'x64')).toBe(
      'https://github.com/777genius/claude_agent_teams_ui/releases/download/v1.2.3/Claude.Agent.Teams.UI.Setup.1.2.3.exe'
    );
    expect(getExpectedReleaseAssetUrl('1.2.3', 'linux', 'x64')).toBe(
      'https://github.com/777genius/claude_agent_teams_ui/releases/download/v1.2.3/Claude.Agent.Teams.UI-1.2.3.AppImage'
    );
  });

  it('extracts updater asset names from latest-mac.yml text', () => {
    const metadata = `
version: 1.2.3
files:
  - url: "Claude.Agent.Teams.UI-1.2.3-arm64-mac.zip"
    sha512: abc
    size: 123
  - url: 'Claude.Agent.Teams.UI-1.2.3-arm64.dmg'
    sha512: def
    size: 456
path: Claude.Agent.Teams.UI-1.2.3-arm64-mac.zip
`;

    expect(parseReleaseMetadataAssetNames(metadata)).toEqual(
      new Set([
        'Claude.Agent.Teams.UI-1.2.3-arm64-mac.zip',
        'Claude.Agent.Teams.UI-1.2.3-arm64.dmg',
      ])
    );
  });

  it('validates arch compatibility for latest-mac.yml', () => {
    const version = '1.2.3';
    const arm64Metadata = `
version: ${version}
files:
  - url: Claude.Agent.Teams.UI-${version}-arm64-mac.zip
    sha512: abc
    size: 123
  - url: Claude.Agent.Teams.UI-${version}-arm64.dmg
    sha512: def
    size: 456
path: Claude.Agent.Teams.UI-${version}-arm64-mac.zip
`;

    expect(getExpectedLatestMacArtifacts(version, 'arm64')).toEqual([
      `Claude.Agent.Teams.UI-${version}-arm64-mac.zip`,
      `Claude.Agent.Teams.UI-${version}-arm64.dmg`,
    ]);
    expect(getLatestMacMetadataUrl(version)).toBe(
      `https://github.com/777genius/claude_agent_teams_ui/releases/download/v${version}/latest-mac.yml`
    );
    expect(isLatestMacMetadataCompatible(arm64Metadata, version, 'arm64')).toBe(true);
    expect(isLatestMacMetadataCompatible(arm64Metadata, version, 'x64')).toBe(false);
  });
});
