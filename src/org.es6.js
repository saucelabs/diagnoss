import { GitHub } from './github';

export async function getReposFromOrgs (orgs) {
  let repos = [];
  let client = new GitHub({
    username: process.env.GITHUB_USER,
    password: process.env.GITHUB_ACCESS_TOKEN
  });
  for (let o of orgs) {
    let org = client.org(o);
    repos = repos.concat(await org.repos());
  }
  return repos;
}
