import yargs from 'yargs';
import moment from 'moment';
import { collaboratorStats } from './collaborators';
import { repoStats } from './repos';
import { getReposFromPackweb } from './packweb';
import { asyncify } from 'asyncbox';
import util from 'util';

async function main () {
  let opts = yargs.argv;
  let repos;
  if (opts.p) {
    repos = await getReposFromPackweb(opts.p);
  } else {
    repos = opts.r.split(',');
  }
  let fromDate = moment(opts.t1);
  let toDate = moment(opts.t2);
  if (opts.c) {
    let users;
    if (typeof opts.c === "string") {
      users = opts.c.split(',');
    }
    let stats = await collaboratorStats(repos, users, fromDate, toDate);
    console.log(stats);
  } else {
    // default to repo stats
    let stats = await repoStats(repos);
    console.log(util.inspect(stats, {depth: 5}));
  }
}

export function diagnoss () {
  asyncify(main);
}
