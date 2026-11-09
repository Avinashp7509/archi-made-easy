#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';

import {
  compareSemver,
  isStableCoreVersion,
  parseSemver,
  UPDATE_SOURCE_CONFIGURED,
  validateLocalRelease,
  validateStableUpdateManifest,
} from '../archi-made-easy/scripts/update-contract.mjs';

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootFlag = process.argv.indexOf('--root');
const repoRoot = rootFlag === -1 ? scriptRoot : path.resolve(process.argv[rootFlag + 1] || '');
// Fixture repositories model a published product whose owner is already configured.
// Only valid together with --root; the real repository is always checked as it is.
const assumeConfiguredOwner = rootFlag !== -1 && process.argv.includes('--assume-configured-owner');
const ownerConfigured = UPDATE_SOURCE_CONFIGURED || assumeConfiguredOwner;
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  try {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    fail(`${relativePath} is missing or unreadable.`);
    return '';
  }
}

function readJson(relativePath) {
  const source = read(relativePath);
  if (!source) return {};
  try {
    return JSON.parse(source);
  } catch {
    fail(`${relativePath} is not valid JSON.`);
    return {};
  }
}

function checkSkillRelease(value, version, isDevelopment) {
  const expectedChannel = isDevelopment ? 'development' : 'stable';
  // While the publishing owner is still the OWNER placeholder, the shipped release
  // must not name an update manifest: that URL would belong to whoever owns the name.
  if (!ownerConfigured && value?.updateManifestUrl !== null) {
    fail('archi-made-easy/skill-release.json must set updateManifestUrl to null until the OWNER placeholder is replaced.');
    return;
  }
  try {
    const release = validateLocalRelease(value);
    if (release.version === version && release.channel === expectedChannel) return;
  } catch {
    // Report the repository-specific cross-artifact requirement below.
  }
  fail(`archi-made-easy/skill-release.json must identify archi-made-easy ${version} as ${expectedChannel}, use the official repository, and pin the trusted update manifest URL.`);
}

function checkStableUpdateManifest(value, expectedVersion, previousVersion, packageVersion, isDevelopment) {
  try {
    const manifest = validateStableUpdateManifest(value);
    const allowedVersions = isDevelopment
      ? [expectedVersion]
      : [expectedVersion, previousVersion].filter(Boolean);
    if (expectedVersion && allowedVersions.includes(manifest.version)
      && (isDevelopment || packageVersion === expectedVersion)) return;
  } catch {
    // Report the repository-specific cross-artifact requirement below.
  }
  const releaseWindow = !isDevelopment && previousVersion
    ? `newest stable v${expectedVersion} or immediate prior v${previousVersion} during the enforced post-Release publication window`
    : `newest published stable v${expectedVersion || '(missing)'}`;
  fail(`docs/skill-updates/archi-made-easy/stable.json must describe the ${releaseWindow} with the fixed repository, immutable tree/archive digests, and official release-notes URL.`);
}

function shieldEscape(value) {
  return value.replaceAll('_', '__').replaceAll('-', '--');
}

function versionLabels(source) {
  return [...source.matchAll(/\bv(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)\b/g)]
    .map((match) => match[1]);
}

const readmeMarkers = {
  en: { development: 'Current development version:', stable: 'Current stable version:' },
  zh: { development: '当前开发版本：', stable: '当前稳定版本：' },
  ja: { development: '現在の開発版:', stable: '現在の安定版:' },
};

function checkReadme(relativePath, source, version, language, isDevelopment) {
  const badge = `/badge/version-${shieldEscape(version)}-`;
  const markerLabel = readmeMarkers[language][isDevelopment ? 'development' : 'stable'];
  const identity = isDevelopment ? 'development' : 'stable';
  const hasMarker = source.split('\n').some((line) => line.includes(markerLabel) && line.includes(`\`v${version}\``));
  if (!source.includes(badge) || !hasMarker) {
    fail(`${relativePath} must advertise ${identity} identity v${version} with an exact escaped badge and explicit ${identity} marker.`);
  }
}

function checkDocument(relativePath, source, version, isDevelopment) {
  const labels = versionLabels(source);
  const identity = isDevelopment ? 'development' : 'stable';
  const englishLabel = isDevelopment ? /development/i : /stable/i;
  const chineseLabel = isDevelopment ? /开发版/ : /稳定版/;
  if (labels.length === 0 || labels.some((label) => label !== version)
    || !englishLabel.test(source) || !chineseLabel.test(source)) {
    fail(`${relativePath} must advertise ${identity} identity v${version} in both languages without a conflicting version alias.`);
  }
}

function checkNoRavenSwitcher(relativePath, source) {
  if (/data-agent=["']raven["']|--agent\s+raven\b|[?&]agent=raven\b/i.test(source)) {
    fail(`${relativePath}: Raven is not an agent-switcher target.`);
  }
}

function checkIdentityTemplate(relativePath, source, isDevelopment) {
  // SVG path coordinates can resemble SemVer (for example, `4.3.6-3.1`).
  // Remove only real SVG d attributes, not path-like text inside other
  // attributes or scripts. Keep the original bytes everywhere else.
  const pathDataRanges = [];
  function collectPathData(node) {
    const location = node.sourceCodeLocation?.attrs?.d;
    if (node.namespaceURI === 'http://www.w3.org/2000/svg' && node.tagName === 'path' && location) {
      pathDataRanges.push(location);
    }
    for (const child of node.childNodes || []) collectPathData(child);
    if (node.content) collectPathData(node.content);
  }
  collectPathData(parse(source, { sourceCodeLocationInfo: true }));
  let sourceWithoutPathData = source;
  for (const { startOffset, endOffset } of pathDataRanges.sort((a, b) => b.startOffset - a.startOffset)) {
    sourceWithoutPathData = sourceWithoutPathData.slice(0, startOffset) + sourceWithoutPathData.slice(endOffset);
  }
  const hasHardcodedVersion = /\b\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\b/.test(sourceWithoutPathData);
  const identity = isDevelopment ? 'development and 开发版' : 'stable and 稳定版';
  const hasIdentity = isDevelopment
    ? /development/i.test(source) && /开发版/.test(source)
    : /stable/i.test(source) && /稳定版/.test(source);
  if (!source.includes('[[ARCHI_MADE_EASY_VERSION]]') || !hasIdentity || hasHardcodedVersion) {
    fail(`${relativePath} must use [[ARCHI_MADE_EASY_VERSION]] with ${identity} labels, never a hardcoded package version.`);
  }
  const versionLines = source.split('\n').filter(line => line.includes('[[ARCHI_MADE_EASY_VERSION]]'));
  const staleIdentity = isDevelopment ? /\bstable\b|稳定版/i : /\bdevelopment\b|开发版/i;
  if (versionLines.some(line => staleIdentity.test(line))) {
    const staleLabel = isDevelopment ? 'stable or 稳定版' : 'development or 开发版';
    fail(`${relativePath} must not label [[ARCHI_MADE_EASY_VERSION]] as ${staleLabel}.`);
  }
}

function checkRoadmap(relativePath, source, version, isDevelopment) {
  const identity = isDevelopment ? 'development line' : 'stable version';
  const marker = `The current ${identity} is \`v${version}\``;
  if (!source.includes(marker)) {
    fail(`${relativePath} must declare the current ${identity} as v${version}.`);
  }
}

const packageJson = readJson('archi-made-easy/package.json');
const changelog = read('CHANGELOG.md');
const unreleasedStart = changelog.search(/^## \[Unreleased\][^\n]*(?:\n|$)/m);
const afterUnreleased = unreleasedStart === -1
  ? ''
  : changelog.slice(unreleasedStart).replace(/^## \[Unreleased\][^\n]*(?:\n|$)/, '');
const nextRelease = afterUnreleased.search(/^## \[/m);
const unreleased = nextRelease === -1 ? afterUnreleased : afterUnreleased.slice(0, nextRelease);
const hasRealUnreleasedChanges = /^\s*-\s+\S/m.test(unreleased);
const version = packageJson.version;
let parsedVersion = null;
try {
  parsedVersion = parseSemver(version);
} catch {
  // The consolidated error below owns package-version policy reporting.
}
const supportedPrerelease = parsedVersion?.prerelease === null
  || (parsedVersion?.prerelease?.length === 2
    && parsedVersion.prerelease[0] === 'dev'
    && /^\d+$/.test(parsedVersion.prerelease[1]));
const hasSupportedVersion = Boolean(parsedVersion && parsedVersion.build === null && supportedPrerelease);
const isDevelopment = Boolean(hasSupportedVersion && parsedVersion.prerelease);
const publishedLabels = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)]
  .map((match) => match[1])
  .filter((label) => label !== 'Unreleased');
for (const label of publishedLabels) {
  if (!isStableCoreVersion(label)) fail(`CHANGELOG published version is not stable SemVer: ${label}.`);
}
const stableLabels = publishedLabels
  .filter(isStableCoreVersion)
  .sort((left, right) => compareSemver(right, left));
const newestStableLabel = stableLabels[0] ?? null;
const previousStableLabel = stableLabels[1] ?? null;

if (!hasSupportedVersion) {
  fail(`package version is not a supported SemVer identity: ${JSON.stringify(version)}`);
} else if (hasRealUnreleasedChanges && !isDevelopment) {
  fail(`Unreleased changes require a prerelease package version; found stable ${version}.`);
}

if (hasSupportedVersion && hasRealUnreleasedChanges) {
  const currentCore = parsedVersion.core.join('.');
  if (newestStableLabel && compareSemver(currentCore, newestStableLabel) <= 0) {
    fail(`Unreleased package core ${currentCore} must be newer than published ${newestStableLabel}.`);
  }
}

if (hasSupportedVersion) {
  checkSkillRelease(readJson('archi-made-easy/skill-release.json'), version, isDevelopment);
  const stableManifestPath = 'docs/skill-updates/archi-made-easy/stable.json';
  if (newestStableLabel) {
    checkStableUpdateManifest(
      readJson(stableManifestPath),
      newestStableLabel,
      previousStableLabel,
      version,
      isDevelopment,
    );
  } else if (fs.existsSync(path.join(repoRoot, stableManifestPath))) {
    // Nothing has been published yet, so nothing may be advertised as a stable update.
    fail(`${stableManifestPath} must not exist before the first published release.`);
  }

  const lock = readJson('archi-made-easy/package-lock.json');
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    fail(`archi-made-easy/package-lock.json must match ${version} at the root and packages[""].`);
  }

  const skill = read('archi-made-easy/SKILL.md');
  const skillVersion = skill.match(/^\s*version:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
  const expectedSkillVersion = `${parsedVersion.core[0]}.${parsedVersion.core[1]}`;
  if (skillVersion !== expectedSkillVersion) {
    fail(`archi-made-easy/SKILL.md metadata version ${skillVersion || '(missing)'} must map to package ${version} as ${expectedSkillVersion}.`);
  }

  const rendererTemplate = read('archi-made-easy/assets/template.html');
  const generatorVersions = [...rendererTemplate.matchAll(/<meta\s+name="generator"\s+content="archi-made-easy\s+([^"]+)"\s*\/?>/g)]
    .map((match) => match[1]);
  if (generatorVersions.length !== 1 || generatorVersions[0] !== version) {
    fail(`archi-made-easy/assets/template.html generator must be archi-made-easy ${version}; found ${generatorVersions.join(', ') || '(missing)'}.`);
  }

  // Translated READMEs return as translations of the product README (see ROADMAP);
  // any that exist are held to the same identity rules.
  const readmes = [['README.md', 'en'], ['README_EN.md', 'en'], ['README_ZH.md', 'zh'], ['README_JA.md', 'ja']]
    .filter(([file], index) => index < 2 || fs.existsSync(path.join(repoRoot, file)))
    .map(([file, language]) => [file, language, read(file)]);
  for (const [file, language, content] of readmes) {
    checkReadme(file, content, version, language, isDevelopment);
    checkNoRavenSwitcher(file, content);
  }
  const english = readmes[0][2];
  const englishMirror = readmes[1][2];
  const chinese = readmes.find(([file]) => file === 'README_ZH.md')?.[2] ?? '';
  if (english !== englishMirror) fail('README_EN.md must remain byte-identical to README.md.');

  if (newestStableLabel && isDevelopment) {
    const stableMinor = newestStableLabel.split('.').slice(0, 2).join('\\.');
    if (new RegExp(`Archi-Made-Easy ${stableMinor} includes\\b`).test(english)
      || new RegExp(`Archi-Made-Easy ${stableMinor} 已覆盖`).test(chinese)) {
      fail(`README capability summary must describe v${version} as development, not published ${newestStableLabel}.`);
    }
  }

  const landing = read('docs/index.html');
  checkDocument('docs/index.html', landing, version, isDevelopment);
  checkNoRavenSwitcher('docs/index.html', landing);
  const proofCounts = [...landing.matchAll(/\b\d+\/\d+\b/g)].map((match) => match[0]);
  const staleProofCounts = [...new Set(proofCounts.filter((count) => count !== '9/9'))];
  if (proofCounts.length === 0 || staleProofCounts.length > 0) {
    const found = staleProofCounts.length > 0 ? `; found ${staleProofCounts.join(', ')}` : '';
    fail(`docs/index.html proof receipt must say 9/9 everywhere; every N/N proof receipt must be exactly 9/9${found}.`);
  }
  const start = read('docs/start.html');
  checkDocument('docs/start.html', start, version, isDevelopment);
  checkNoRavenSwitcher('docs/start.html', start);
  checkRoadmap('ROADMAP.md', read('ROADMAP.md'), version, isDevelopment);

  for (const templatePath of [
    'scripts/start-template.html',
    'scripts/guide-template.html',
    'scripts/gallery-template.html',
  ]) {
    checkIdentityTemplate(templatePath, read(templatePath), isDevelopment);
  }

  const changelogMarker = `Development identity: \`v${version}\``;
  if (hasRealUnreleasedChanges && !unreleased.includes(changelogMarker)) {
    fail(`CHANGELOG.md Unreleased must declare ${changelogMarker}.`);
  }
}

if (failures.length > 0) {
  for (const message of failures) console.error(`release identity: ${message}`);
  process.exit(1);
}

console.log(`release identity ok: ${version}`);
