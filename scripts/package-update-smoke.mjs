import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the update code from the actual clean package. Keeping this gate
// separate lets notifier edge cases reuse it without replaying every renderer.
export async function verifyPackagedUpdateChecker(skillRoot, cacheDirectory) {
  const updateChecker = path.join(skillRoot, 'scripts', 'check-update.mjs');
  const packageJson = JSON.parse(fs.readFileSync(path.join(skillRoot, 'package.json'), 'utf8'));
  const updateCheck = spawnSync(process.execPath, [updateChecker], {
    cwd: skillRoot,
    encoding: 'utf8',
    env: { ...process.env, ARCHI_MADE_EASY_UPDATE_CHECK_DISABLED: '1' },
  });
  if (updateCheck.status !== 0) {
    throw new Error(`packaged update checker failed with ${updateCheck.status}\n${updateCheck.stderr}`);
  }
  let updateReceipt;
  try {
    updateReceipt = JSON.parse(updateCheck.stdout);
  } catch {
    throw new Error('packaged update checker did not return valid JSON');
  }
  if (updateReceipt.status !== 'silent' || updateReceipt.reason !== 'disabled') {
    throw new Error('packaged update checker did not honor the local disable switch');
  }

  const checker = await import(pathToFileURL(updateChecker).href);
  const versionCore = /^(\d+)\.(\d+)\.(\d+)/.exec(packageJson.version);
  if (!versionCore) throw new Error('package version cannot produce an update-check smoke candidate');
  const candidateVersion = `${versionCore[1]}.${versionCore[2]}.${BigInt(versionCore[3]) + 1n}`;
  const candidate = {
    schemaVersion: 1,
    skillId: 'archi-made-easy',
    channel: 'stable',
    version: candidateVersion,
    publishedAt: '2026-08-28T00:00:00Z',
    source: {
      repository: 'https://github.com/OWNER/archi-made-easy',
      ref: `v${candidateVersion}`,
      treeSha: 'a'.repeat(40),
    },
    artifact: { sha256: 'b'.repeat(64) },
    summary: 'Package smoke candidate.',
    releaseNotes: `https://github.com/OWNER/archi-made-easy/releases/tag/v${candidateVersion}`,
    severity: 'normal',
  };
  const fetchImpl = async () => new Response(JSON.stringify(candidate), {
    status: 200,
    headers: { 'content-type': 'application/json', etag: '"package-smoke"' },
  });
  // A release without an update manifest (the state before a publishing owner exists)
  // must stay silent and never touch the network.
  let releasePath = path.join(skillRoot, 'skill-release.json');
  const packagedRelease = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
  if (packagedRelease.updateManifestUrl === null) {
    let fetched = false;
    const unconfigured = await checker.checkForUpdate({
      releasePath,
      cacheDirectory,
      fetchImpl: async () => { fetched = true; return fetchImpl(); },
      now: () => Date.parse('2026-08-28T00:00:00Z'),
      random: () => 0.5,
    });
    if (unconfigured.status !== 'silent' || unconfigured.reason !== 'not-configured' || fetched) {
      throw new Error(`packaged update checker contacted an unconfigured update source: ${JSON.stringify(unconfigured)}`);
    }
    // Exercise the configured path with a copy that names the contract's manifest URL.
    const contract = await import(pathToFileURL(path.join(skillRoot, 'scripts', 'update-contract.mjs')).href);
    releasePath = path.join(cacheDirectory, 'configured-skill-release.json');
    fs.mkdirSync(cacheDirectory, { recursive: true });
    fs.writeFileSync(releasePath, `${JSON.stringify({ ...packagedRelease, updateManifestUrl: contract.DEFAULT_MANIFEST_URL }, null, 2)}\n`);
  }
  const notifierReceipt = await checker.checkForUpdate({
    releasePath,
    cacheDirectory,
    fetchImpl,
    now: () => Date.parse('2026-08-28T00:00:00Z'),
    random: () => 0.5,
  });
  if (notifierReceipt.status !== 'update_available') {
    throw new Error(`packaged update checker did not return an update candidate: ${JSON.stringify(notifierReceipt)}`);
  }
  const notifierSnooze = await checker.setUpdatePreference({
    releasePath,
    cacheDirectory,
    eventKey: notifierReceipt.eventKey,
    mode: 'snooze',
    now: () => Date.parse('2026-08-28T00:00:01Z'),
  });
  if (notifierSnooze.status !== 'snoozed') {
    throw new Error('packaged update checker did not persist an explicit snooze');
  }

  return { candidateVersion, notifierReceipt };
}
