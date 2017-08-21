import _ from 'lodash';
import moment from 'moment';
import { GitHub } from './github';
import { parallel } from 'asyncbox';
import { padStr } from './utils';

export async function contributorStats (repoList) {
  let client = new GitHub({
    username: process.env.GITHUB_USER,
    password: process.env.GITHUB_ACCESS_TOKEN
  });
  let contribMap = {};
  let numContributors = 0, numCommits = 0;
  for (let r of repoList) {
    let repo = client.repo(...r.split('/'));
    let repoStats;
    try {
      repoStats = await repo.contributorStats();
    } catch (e) {
      console.warn(`Got error for repo ${r}: ${e.message}; continuing`);
      continue;
    }
    for (let repoStat of repoStats) {
      let user = repoStat.author.login;
      let count = repoStat.total;
      let activeWeeks = 0;
      let lastSeenAt = 0;
      if (repoStat.weeks && repoStat.weeks.length > 0) {
        let activeWeekSets = repoStat.weeks.filter(w => w.a || w.d || w.c);
        activeWeeks += activeWeekSets.length;
        if (activeWeekSets.length) {
          let weekDates = activeWeekSets.map(w => w.w);
          weekDates.sort();
          lastSeenAt = weekDates[weekDates.length - 1] * 1000;
        }
      }
      // if we already have an entry in the map, we need to add stuff
      if (contribMap[user]) {
        // add the number of commits to the count for this user
        contribMap[user].total += count;
        // now if we've never seen this week before, add it to the map
        // greater
        if (!contribMap[user].weeksMap[lastSeenAt]) {
          contribMap[user].weeksMap[lastSeenAt] = 1;
        }
        // update the most popular repo designation if the commits for this
        // repo are the highest so far
        if (count > contribMap[user].mostPopularRepo.count) {
          contribMap[user].mostPopularRepo = {name: r, count};
        }
        // likewise update the lastSeenAt designation if the week for this repo
        // is the most recent for this user
        if (lastSeenAt > contribMap[user].lastSeenAt) {
          contribMap[user].lastSeentAt = lastSeenAt;
        }
        numCommits += count
      } else {
        // if we've never seen the user before, set up everything afresh
        contribMap[user] = {
          total: count,
          mostPopularRepo: {name: r, count},
          weeksMap: {[lastSeenAt]: 1},
          lastSeenAt
        };
        numContributors++;
      }
    }
  }
  // get into an array and sort by most commits
  let contribArr = _.keys(contribMap).map(user => [
    user,
    contribMap[user].total,
    contribMap[user].mostPopularRepo.name,
    _.size(contribMap[user].weeksMap),
    contribMap[user].lastSeenAt
  ]);
  contribArr.sort((a, b) => b[1] - a[1]);
  return {contributors: contribArr, numContributors, numCommits};
}

export function printContribStats (contributors, numContributors, numCommits) {
  let pad = 30, pad2 = 15;
  console.log(padStr('User', pad),
              padStr('Commits', pad2),
              padStr('Active Weeks', pad2),
              padStr('Last Seen', pad2),
              'Commits Most To');
  let lines = [padStr('----', pad),
               padStr('-------', pad2),
               padStr('------------', pad2),
               padStr('---------', pad2),
               '---------------'];
  console.log(...lines);
  for (let c of contributors) {
    let [user, commits, mostPopularRepo, activeWeeks, lastSeenAt] = c;
    console.log(padStr('@' + user, pad),
                padStr(commits, pad2),
                padStr(activeWeeks, pad2),
                padStr(moment(lastSeenAt).format('YYYY-MM-DD'), pad2),
                mostPopularRepo);
  }
  console.log(...lines);
  console.log(padStr(`${numContributors} contributors`, pad),
              padStr(`${numCommits} commits`, pad2));
}
