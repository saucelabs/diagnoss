import _ from 'lodash'
import moment from 'moment';
import { GitHub } from './github';

const dayFormat = "YYYY-MM-DD";

export async function pullsOverTime (repos=[], opts={since: null, by: 'week'}) {
  if (opts.by !== 'week' && opts.by !== 'day') {
    throw new Error("opts.by can only be 'week' or 'day' right now");
  }
  if (!opts.since) {
    opts.since = '1982-09-26';
  }
  let since = moment(opts.since);
  let client = new GitHub({
    username: process.env.GITHUB_USER,
    password: process.env.GITHUB_ACCESS_TOKEN
  });
  let latestDay = moment('1982-09-26');
  let earliestDay = moment('2222-09-26');
  let dayStats = {}; // keys are days, values are counts of PRs for that day
  for (let repo of repos) {
    let pulls = await mergedPulls(client, repo, since);
    for (let pull of pulls) {
      let closedAt = moment(pull.closed_at);
      if (closedAt.isBefore(earliestDay, 'day')) {
        earliestDay = moment(closedAt);
      } else if (closedAt.isAfter(latestDay, 'day')) {
        latestDay = moment(closedAt);
      }
      let dayKey = closedAt.format(dayFormat);
      if (!dayStats[dayKey]) {
        dayStats[dayKey] = 0;
      }
      dayStats[dayKey]++;
    }
  }
  // now build an array of all days, with their values
  let curDay = moment(earliestDay);
  let dayArr = [];
  while (curDay.isSameOrBefore(latestDay, 'day')) {
    let count = dayStats[curDay.format(dayFormat)] || 0;
    dayArr.push([curDay.format(dayFormat), count]);
    curDay.add(1, 'day');
  }
  if (opts.by === 'day') {
    return dayArr;
  }
  let weekArr = [];
  let firstDayOfWeek = earliestDay.day();
  let curWeekDate = null, curWeekCount = 0;
  for (let [day, count] of dayArr) {
    let curDay = moment(day);
    if (curDay.day() === firstDayOfWeek || curDay.isSameOrAfter(latestDay, 'day')) {
      // if the current day matches the weekday of the first day in our set,
      // that means we are starting a new week. so reset curWeekDate.
      // but before we do that, if we already have a curWeekDate, make sure
      // to write all the counts that have been added to that array element,
      // then reset the count.
      // We also want to do this if we are at the last day in our set, to make
      // sure we don't miss anything
      if (curWeekDate) {
        weekArr.push([curWeekDate.format(dayFormat), curWeekCount]);
        curWeekCount = 0;
      }
      curWeekDate = moment(day);
    }
    curWeekCount += count;
  }
  return weekArr;
}

async function mergedPulls (client, repoSpec, since) {
  let search = client.search();
  return await search.mergedPulls(repoSpec, since.format("YYYY-MM-DD"));
}

export function printPullStats (dateArr) {
  for (let [date, count] of dateArr) {
    console.log(`${date}\t${count}`);
  }
}
