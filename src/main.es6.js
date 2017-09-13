import yargs from 'yargs';
import moment from 'moment';
import { collaboratorStats } from './collaborators';
import { contributorStats, printContribStats } from './contributors';
import { repoStats } from './repos';
import { issueStats } from './issues';
import { pullsOverTime, printPullStats } from './pulls';
import { getReposFromPackweb } from './packweb';
import { getReposFromOrgs } from './org';
import { numDownloads } from './releases';
import { asyncify } from 'asyncbox';
import util from 'util';

async function main () {
  let opts = yargs.argv;
  let repos;
  if (opts.o) {
    repos = await getReposFromOrgs(opts.o.split(','));
  } else if (opts.p) {
    repos = await getReposFromPackweb(opts.p);
  } else {
    repos = opts.r.split(',');
  }
  let fromDate = opts.t1 ? moment(opts.t1) : null;
  let toDate = opts.t2 ? moment(opts.t2) : null;
  if (opts.n) {
    // just get basic contributor stats
    let {contributors, numContributors, numCommits} = await contributorStats(repos);
    printContribStats(contributors, numContributors, numCommits);
  } else if (opts.c) {
    // get full collaborator stats
    let users;
    if (typeof opts.c === "string") {
      users = opts.c.split(',');
    }
    let stats = await collaboratorStats(repos, users, fromDate, toDate);
    console.log(stats);
  } else if (opts.issuesByDay) {
    let stats = await issueStats(repos, {since: opts.issuesByDay});
    console.log(util.inspect(stats, {depth: 5}));
  } else if (opts.pulls) {
    let stats = await pullsOverTime(repos, {since: fromDate || null, by: 'week'});
    printPullStats(stats);
  } else if (opts.downloads) {
    let num = await numDownloads(repos, {since: fromDate, until: toDate});
    console.log(num);
  } else {
    // default to repo stats
    let stats = await repoStats(repos);
    console.log(util.inspect(stats, {depth: 5}));
  }
}

export function diagnoss () {
  asyncify(main);
}
