import _ from 'lodash';
import { GitHub } from './github';

export async function repoStats (repoList=[]) {
  let stats = {};

  let client = new GitHub({
    username: process.env.GITHUB_USER,
    password: process.env.GITHUB_ACCESS_TOKEN
  });
  let totals = {
    contributors: 0,
    numContributors: 0,
    numCommits: 0,
    numIssuesClosed: 0,
    numPRsMerged: 0,
    numStargazers: 0,
    numWatchers: 0,
    numForks: 0,
  };
  let allContribs = [];
  for (let repoSpec of repoList) {
    let indivStats = await statsForRepo(client, repoSpec);
    stats[repoSpec] = indivStats;
    for (let k of _.without(_.keys(totals), 'contributors', 'numContributors')) {
      totals[k] += indivStats[k];
    }
    allContribs = allContribs.concat(indivStats.contributors);
  }
  totals.contributors = _.uniq(allContribs);
  totals.numContributors = totals.contributors.length;
  stats.all = totals;
  return stats;
}

async function getNumIssuesClosed (client, repoSpec) {
  let res = await client.search().issues(
      `is:issue ` +
      `is:closed ` +
      `repo:${repoSpec}`,
    {}, true);
  return res.length;
}

async function getNumPRsMerged (client, repoSpec) {
  let res = await client.search().issues(
      `is:pr ` +
      `is:closed ` +
      `repo:${repoSpec}`,
    {}, true);
  return res.length;
}

async function statsForRepo (client, repoSpec) {
  let [user, repoName] = repoSpec.split('/');
  let repo = client.repo(user, repoName);
  let contributors = _.pluck(await repo.contributors(), 'login');
  let numCommits = (await repo.commits(null, {}, true)).length;
  let numIssuesClosed = await getNumIssuesClosed(client, repoSpec);
  let numPRsMerged = await getNumPRsMerged(client, repoSpec);
  let info = await repo.info();
  return {
    contributors,
    numContributors: contributors.length,
    numCommits,
    numIssuesClosed,
    numPRsMerged,
    numStargazers: info.stargazers_count,
    numWatchers: info.watchers_count,
    numForks: info.forks_count,
  };
}
