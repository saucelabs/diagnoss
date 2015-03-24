import util from 'util';
import _ from 'lodash';
import moment from 'moment';
import { GitHub } from './github';
import { parallel } from 'asyncbox';

export async function collaboratorStats (user, repoName, collabs, t1, t2) {
  let stats = {};
  let client = new GitHub({
    username: process.env.GITHUB_USER,
    password: process.env.GITHUB_ACCESS_TOKEN
  });
  let duration = moment.duration(t2.diff(t1));
  let days = duration.asDays();
  let repo = client.repo(user, repoName);
  if (!collabs) {
    collabs = _.pluck(await repo.collaborators(), 'login');
  }
  // we want:
  // comments (num, length)
  // issues (num closed)
  // commits (not merge, not changelog; num, changes)
  let commits = await commitsForCollabs(repo, collabs, t1, t2);
  let closed = await issuesClosed(client, user, repoName, collabs, t1, t2);
  let [issuesCommented, prsCommented] = await issuesPullsCommented(client,
      user, repoName, collabs, t1, t2);
  let issueCommentStats = await commentStats(client, user, repoName, issuesCommented, collabs, t1, t2);
  let prCommentStats = await commentStats(client, user, repoName, prsCommented, collabs, t1, t2);
  for (let c of collabs) {
    stats[c] = {
      commits: commits[c].length,
      commitsPerDay: commits[c].length / days,
      issuesClosed: closed[c].length,
      issuesClosedPerDay: closed[c].length / days,
      issuesCommented: issuesCommented[c].length,
      issueComments: issueCommentStats[c].comments,
      issueCommentsPerDay: issueCommentStats[c].comments / days,
      issueCommentAvgLen: issueCommentStats[c].avgBody,
      pullsCommented: prsCommented[c].length,
      pullComments: prCommentStats[c].comments,
      pullCommentsPerDay: prCommentStats[c].comments / days,
      pullCommentAvgLen: prCommentStats[c].avgBody,
    };
  }
  return stats;
}

async function commitsForCollabs (repo, collabs, t1, t2) {
  let usingDate = t1 !== t2;
  let commits = {};
  let commitsOpts = {};
  for (let c of collabs) {
    if (usingDate) {
      commitsOpts.since = t1.format();
      commitsOpts.until = t2.format();
    }
    commits[c] = await repo.commits(c, commitsOpts, true);
    commits[c] = commits[c].filter(validCommit);
    commits[c] = await fullCommitSet(repo, commits[c]);
  }
  return commits;
}

function validCommit (c) {
  if (c.commit.message.indexOf("Merge") === 0) {
    return false;
  }
  return true;
}

async function fullCommitSet (repo, commits) {
  let allShas = [];
  let promises = [];
  for (let commit of commits) {
    promises.push(repo.commit(commit.sha));
  }
  let fullCommits = await parallel(promises);
  fullCommits = fullCommits.filter(f => {
    if (_.contains(allShas, f.sha)) {
      return false;
    }
    allShas.push(f.sha);
    if (f.author.login !== f.committer.login) {
      return false;
    }
    let fileNames = _.pluck(f.files, 'filename');
    let stopFiles = ['changelog.txt', 'package.json'];
    let hasOtherFile = false;
    for (let file of fileNames) {
      if (!_.contains(stopFiles, file.toLowerCase())) {
        hasOtherFile = true;
        break;
      }
    }
    if (!hasOtherFile) {
      return false;
    }
    return true;
  }).map(f => {
    return {
      sha: f.sha,
      additions: f.stats.additions,
      deletions: f.stats.deletions,
      filesChanged: f.files.length,
      message: f.commit.message,
    };
  });
  return fullCommits;
}

async function issuesClosed (client, userName, repoName, collabs, t1, t2) {
  let issues = {};
  for (let c of collabs) {
    issues[c] = [];
    let res = await client.search().issues(
        `assignee:${c} ` +
        `is:issue ` +
        `is:closed ` +
        `repo:${userName}/${repoName} ` +
        `updated:>=${t1.format()} ` +
        `updated:<=${t2.format()}`,
      {}, true);
    for (let i of res.items) {
      issues[c].push(parseIssue(i, c));
    }
    issues[c] = issues[c].filter(i => {
      let closedAt = moment(i.closed_at);
      return closedAt >= t1 && closedAt <= t2;
    });
  }
  return issues;
}

async function issuesPullsCommented (client, userName, repoName, collabs, t1, t2) {
  let issues = {};
  let prs = {};
  for (let c of collabs) {
    issues[c] = [];
    prs[c] = [];
    let res = await client.search().issues(
        `commenter:${c} ` +
        `repo:${userName}/${repoName} ` +
        `updated:>=${t1.format()} ` +
        `updated:<=${t2.format()}`,
      {}, true);
    for (let i of res.items) {
      if (i.pull_request) {
        prs[c].push(parsePull(i, c));
      } else {
        issues[c].push(parseIssue(i, c));
      }
    }
  }
  return [issues, prs];
}

async function commentStats (client, userName, repoName, issues, collabs, t1, t2) {
  let stats = {};
  let comments = {};
  let promises = {};
  let flatIssues = _.flatten(_.values(issues));
  let shifts = Math.floor(flatIssues.length / 4);
  let shift = 0;
  for (let issue of _.flatten(_.values(issues))) {
    let thisShift = shift % shifts;
    if (!promises[thisShift]) {
      promises[thisShift] = [];
    }
    let api = client.issue(userName, repoName, issue.number);
    promises[thisShift].push(api.comments.bind(api));
    shift++;
  }
  let results = [];
  for (let promiseSet of _.values(promises)) {
    let innerPromises = [];
    for (let p of promiseSet) {
      innerPromises.push(p(true));
    }
    results = results.concat(await parallel(innerPromises));
  }
  for (let comment of _.flatten(results)) {
    let commenter = comment.user.login;
    let written = moment(comment.created_at);
    if (_.contains(collabs, commenter) && written >= t1 && written <= t2) {
      if (!comments[commenter]) {
        comments[commenter] = [];
      }
      comments[commenter].push(comment.body.length);
    }
  }
  for (let c of collabs) {
    if (!stats[c]) {
      stats[c] = {};
    }
    if (comments[c]) {
      stats[c] = {
        comments: comments[c].length,
        avgBody: _.sum(comments[c]) / comments[c].length
      };
    }
  }
  return stats;
}

async function issuesForCollabs (client, userName, repoName, collabs, t1, t2) {
  let issues = {};
  let prs = {};
  for (let c of collabs) {
    issues[c] = [];
    prs[c] = [];
    let res = await client.search().issues(
        `involves:${c} ` +
        `repo:${userName}/${repoName} ` +
        `updated:>=${t1.format()} ` +
        `updated:<=${t2.format()}`,
      {}, true);
    for (let i of res.items) {
      if (i.pull_request) {
        prs[c].push(parsePull(i, c));
      } else {
        issues[c].push(parseIssue(i, c));
      }
    }
    prs[c] = prs[c].filter(validPull);
    issues[c] = issues[c].filter(validIssue);
  }
  return [issues, prs];
}

function parseIssueOrPr (thing, collaborator) {
  let summary = {assigned: false, created: false, mentioned: false};
  if (thing.assignee && thing.assignee.login === collaborator) {
    summary.assigned = true;
  }
  if (thing.user && thing.user.login === collaborator) {
    summary.created = true;
  }
  if (thing.body && thing.body.toString().indexOf(`@${collaborator}`) !== -1) {
    summary.mentioned = true;
  }
  summary.title = thing.title;
  summary.number = thing.number;
  return summary;
}

function parseIssue (issue, collaborator) {
  let summary = parseIssueOrPr(issue, collaborator);
  summary.state = issue.state;
  summary.closed_at = issue.closed_at;
  return summary;
}

function parsePull (pull, collaborator) {
  let summary = parseIssueOrPr(pull, collaborator);
  return summary;
}

function validPull (p) {
  return (!p.created && (
          (p.assigned && p.state === 'closed') ||
          p.mentioned));
}

function validIssue () {
  return true;
}
