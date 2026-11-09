import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export const name = 'archi-made-easy-dsh';
export const PACKAGE_NAME = '@OWNER/archi-made-easy-dsh';

export function resolveArchiMadeEasySkillRoot(profileBaseUrl) {
  if (!profileBaseUrl) {
    throw new Error('archi-made-easy-dsh: missing DSH profile baseUrl for package resolution');
  }
  let manifestPath;
  try {
    manifestPath = createRequire(profileBaseUrl).resolve(`${PACKAGE_NAME}/package.json`);
  } catch (error) {
    throw new Error(
      `archi-made-easy-dsh: cannot resolve ${PACKAGE_NAME}/package.json from the DSH profile`,
      { cause: error },
    );
  }
  return join(dirname(manifestPath), 'skills');
}
