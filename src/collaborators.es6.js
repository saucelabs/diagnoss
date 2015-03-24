import util from 'util';
import _ from 'lodash';
import { GitHub } from './github';
import { parallel } from 'asyncbox';

export async function collaboratorStats (user, repoName, collabs, t1, t2) {
  let stats = {};
  let client = new GitHub({
    username: process.env.GITHUB_USER,
    password: process.env.GITHUB_ACCESS_TOKEN
  });
  let repo = client.repo(user, repoName);
  if (!collabs) {
    collabs = _.pluck(await repo.collaborators(), 'login');
  }
  // we want:
  // comments (num, length)
  // issues (num closed)
  // commits (not merge, not changelog; num, changes)
  //let commits = await commitsForCollabs(repo, collabs, t1, t2);
  let issues = await issuesForCollabs(client, user, repoName, collabs, t1, t2);
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
    console.log(res.items);
    for (let i of res.items) {
      console.log(i);
      if (i.pull_request) {
        prs[c].push(parsePull(i, c));
      } else {
        issues[c].push(parseIssue(i, c));
      }
    }
    prs[c] = prs[c].filter(validPull);
    issues[c] = issues[c].filter(validIssue);
  }
  console.log(util.inspect(issues, {depth: 6}));
  console.log(util.inspect(prs, {depth: 6}));
  return [issues, prs];
}

function parseIssueOrPr (thing, collaborator) {
  let summary = {assigned: false, created: false, mentioned: false};
  console.log(thing);
  if (thing.assignee && thing.assignee.login === collaborator) {
    summary.assigned = true;
  }
  console.log(thing);
  if (thing.user && thing.user.login === collaborator) {
    summary.created = true;
  }
  if (thing.body && thing.body.toString().indexOf(`@${collaborator}`) !== -1) {
    summary.mentioned = true;
  }
  summary.title = thing.title;
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
