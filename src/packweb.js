import { PackWeb, parseConfig } from 'packweb';

export async function getReposFromPackweb (configPath) {
  let pw = new PackWeb(await parseConfig(configPath));
  let repos = await pw.reposForPackages();
  return repos;
}
