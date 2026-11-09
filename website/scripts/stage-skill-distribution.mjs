import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stageCleanSkill } from '../../scripts/stage-clean-skill.mjs';

// Reuse the ZIP/DSH file selection and manifest cleanup. The discovery protocol
// needs SKILL.md at the archive root; the existing archi-made-easy.zip keeps its wrapper.
export function stageSkillDistribution(repo, target) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-distribution-'));
  try {
    const skill = path.join(scratch, 'archi-made-easy');
    const modes = path.join(scratch, 'modes.json');
    stageCleanSkill({ repoRoot: repo, destination: skill, modeManifest: modes });
    const archive = path.join(scratch, 'skill.zip');
    execFileSync(process.execPath, [path.join(repo, 'scripts/write-deterministic-zip.mjs'),
      skill, archive, '--mode-manifest', modes, '--contents-only'], { stdio: 'pipe' });
    const bytes = fs.readFileSync(archive);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const directory = path.join(target, '.well-known/agent-skills');
    if (fs.existsSync(directory)) throw new Error('Public assets collide with generated Skill distribution');
    fs.mkdirSync(directory, { recursive: true });
    const filename = `archi-made-easy.${hash}.zip`;
    fs.writeFileSync(path.join(directory, filename), bytes);
    fs.writeFileSync(path.join(directory, 'index.json'), `${JSON.stringify({
      $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
      skills: [{
        name: 'archi-made-easy',
        description: 'Create validated interactive diagrams and one-page explainers with your AI agent.',
        type: 'archive', url: `./${filename}`, digest: `sha256:${hash}`,
      }],
    }, null, 2)}\n`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
