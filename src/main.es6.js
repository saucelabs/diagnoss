import yargs from 'yargs';
import moment from 'moment';
import { collaboratorStats } from './collaborators';
import { asyncify } from 'asyncbox';

async function main () {
  let opts = yargs.argv;
  let repos = opts.r.split(',');
  let fromDate = moment(opts.t1);
  let toDate = moment(opts.t2);
  if (opts.c) {
    let users;
    if (typeof opts.c === "string") {
      users = opts.c.split(',');
    }
    let stats = await collaboratorStats(repos, users, fromDate, toDate);
    console.log(stats);
  }
}

export function diagnoss () {
  asyncify(main);
}
