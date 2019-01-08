import _ from 'lodash';
import moment from 'moment';
import { GitHub } from './github';
import log from 'fancy-log';


export async function issueStats (repoList = [], opts = {since: null}) {
  if (!opts.since) {
    throw new Error("You must provide a 'since' parameter to issueStats!");
  }

  if (repoList.length > 1) {
    throw new Error('Right now you can only get issue stats for one repo');
  }

  let stats = {};

  let client = new GitHub({
    username: process.env.GITHUB_USER,
    password: process.env.GITHUB_ACCESS_TOKEN
  });
  for (let repoSpec of repoList) {
    stats[repoSpec] = await statsForRepo(client, repoSpec, opts.since);
    let rawStats = _.clone(stats[repoSpec]);
    stats[repoSpec].avgNew = getAverage(rawStats, 'newIssues');
    stats[repoSpec].avgUpdated = getAverage(rawStats, 'updatedIssues');
  }
  return stats;
}

function getAverage (stats, key) {
  let total = 0, num = 0;
  for (let [, dayStats] of _.pairs(stats)) {
    total += dayStats[key];
    num++;
  }
  if (num === 0) {
    return 0;
  }
  return total / num;
}

async function getNumNewIssuesForDay (client, repoSpec, day) {
  return await client.search().numIssues(
      `type:issue ` +
      `repo:${repoSpec} ` +
      `created:${day}`,
    {});
}

async function getNumUpdatedIssuesForDay (client, repoSpec, day) {
  return await client.search().numIssues(
      `type:issue ` +
      `repo:${repoSpec} ` +
      `updated:${day}`,
    {});
}

async function statsForRepo (client, repoSpec, since) {
  let curDay = moment(since);
  log(`starting with ${since} / ${curDay}`);
  let days = [];
  let stats = {};
  while (curDay < moment(Date.now())) {
    days.push(moment(curDay));
    curDay.add(1, 'd');
  }
  for (let day of days) {
    let dayStr = day.format('YYYY-MM-DD');
    stats[dayStr] = {
      newIssues: await getNumNewIssuesForDay(client, repoSpec, dayStr),
      updatedIssues: await getNumUpdatedIssuesForDay(client, repoSpec, dayStr)
    };
  }
  return stats;
}
