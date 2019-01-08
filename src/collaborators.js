import _ from 'lodash';
import moment from 'moment';
import { GitHub } from './github';
import { parallel } from 'asyncbox';
import log from 'fancy-log';


export async function collaboratorStats (repoList, collabs, t1, t2) {
  let stats = {};
  let client = new GitHub({
    username: process.env.GITHUB_USER,
    password: process.env.GITHUB_ACCESS_TOKEN
  });
  for (let repo of repoList) {
    stats[repo] = await statsForRepo(client, repo, collabs, t1, t2);
  }
  if (_.keys(stats).length === 1) {
    return stats[_.keys(stats)[0]];
  }
  stats.all = {};
  let duration = moment.duration(t2.diff(t1));
  let days = duration.asDays() * 5 / 7; // "work days"
  for (let c of collabs) {
    let commits = 0, commitsLines = 0, issuesClosed = 0, issuesCommented = 0,
        issueComments = 0, issueCommentAvgLen = 0, pullsCommented = 0,
        pullComments = 0, pullCommentAvgLen = 0;
    for (let [repo, repoStats] of _.pairs(stats)) {
      if (repo === 'all') {continue;}
      commits += repoStats[c].commits;
      commitsLines += repoStats[c].commitsTotalLinesOfWork;
      issuesClosed += repoStats[c].issuesClosed;
      issuesCommented += repoStats[c].issuesCommented;
      let newTotalIssueComments = issueComments + repoStats[c].issueComments;
      issueCommentAvgLen = (issueComments * issueCommentAvgLen) / newTotalIssueComments + (repoStats[c].issueComments * repoStats[c].issueCommentAvgLen) / newTotalIssueComments;
      issueComments += repoStats[c].issueComments;
      pullsCommented += repoStats[c].pullsCommented;
      let newTotalPullComments = pullComments + repoStats[c].pullComments;
      pullCommentAvgLen = (pullComments * pullCommentAvgLen) / newTotalPullComments + (repoStats[c].pullComments * repoStats[c].pullCommentAvgLen) / newTotalPullComments;
      pullComments += repoStats[c].pullComments;

    }
    stats.all[c] = {
      commits,
      commitsPerDay: commits / days,
      commitsTotalLinesOfWork: commitsLines,
      issuesClosed,
      issuesClosedPerDay: issuesClosed / days,
      issuesCommented,
      issueComments,
      issueCommentsPerDay: issueComments / days,
      issueCommentAvgLen,
      pullsCommented,
      pullComments,
      pullCommentsPerDay: pullComments / days,
      pullCommentAvgLen
    };
  }
  return stats;
}

async function statsForRepo (client, repoSpec, collabs, t1, t2) {
  log.error('GETTING STATS FOR: ' + repoSpec);
  log.error('==================');
  let stats = {};
  let duration = moment.duration(t2.diff(t1));
  let days = duration.asDays() * 5 / 7; // "work days"
  let [user, repoName] = repoSpec.split('/');
  let repo = client.repo(user, repoName);
  if (!collabs) {
    collabs = _.pluck(await repo.collaborators(), 'login');
  }
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
      commitsTotalLinesOfWork: _.sum(_.pluck(commits[c], 'linesOfWork')),
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
  log.error('');
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
    if (commits[c].length > 0) {
      commits[c] = await fullCommitSet(repo, commits[c]);
    }
  }
  return commits;
}

function validCommit (c) {
  if (c.commit.message.indexOf('Merge') === 0) {
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
    if (!(f.author && f.committer) || f.author.login !== f.committer.login) {
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
    let netLines = f.stats.additions - f.stats.deletions;
    let linesOfWork = Math.abs(netLines);
    if (linesOfWork > 500) {
      // assume more than 500 net lines in a single commit is probably
      // bringing in 3rd-party code
      linesOfWork = 0;
    }
    return {
      sha: f.sha,
      linesOfWork,
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
        `updated:${t1.format()}..${t2.format()}`,
      {}, true);
    for (let i of res) {
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
        `updated:${t1.format()}..${t2.format()}`,
      {}, true);
    for (let i of res) {
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
  let issueNums = [];
  flatIssues = flatIssues.filter(i => {
    if (!_.contains(issueNums, i.number)) {
      issueNums.push(i.number);
      return true;
    }
    return false;
  });
  let shifts = Math.floor(flatIssues.length / 4);
  let shift = 0;
  for (let issue of flatIssues) {
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
  let commenters = {};
  for (let comment of _.flatten(results)) {
    let commenter = comment.user.login;
    if (!commenters[commenter]) {
      commenters[commenter] = 0;
    }
    commenters[commenter]++;
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
    } else {
      stats[c] = {comments: 0, avgBody: 0};
    }
  }
  return stats;
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
