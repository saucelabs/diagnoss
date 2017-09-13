import _ from 'lodash';
import Q from 'q';
import GHApi from 'github';
import moment from 'moment';
import { sleep } from 'asyncbox';

export class GitHub {
  constructor (opts) {
    this.opts = opts;
  }

  org (org) {
    return new GitHubOrg(this.opts, org);
  }

  repo (user, repo) {
    return new GitHubRepo(this.opts, user, repo);
  }

  search () {
    return new GitHubSearch(this.opts);
  }

  issue (user, repo, number) {
    return new GitHubIssue(this.opts, user, repo, number);
  }
}

class GitHubClient {
  constructor (opts) {
    Object.assign(this, opts);
    this.clientType = null;
    this.apiResultListWrapper = null;
    this.client = new GHApi({
      version: "3.0.0"
    });
  }

  unwrapRes (res) {
    // everything seems to be wrapped in a 'data' response now
    res = res.data;
    if (!res) {
      throw new Error("response was not wrapped with 'data' field, look into it");
    }
    if (this.apiResultListWrapper) {
      res = res[this.apiResultListWrapper];
    }
    return res;
  }

  async doRequest (method, apiOpts = {}, allResults = false, countOnly = false) {
    if (!this.clientType) {
      throw new Error("Client type required");
    }
    this.client.authenticate({
      type: "basic",
      username: this.username,
      password: this.password,
    });
    let actualRequest = async (opts) => {
      console.error(`  --> ${this.clientType}.${method} ` +
                    `${JSON.stringify(apiOpts)}`);
      let res;
      try {
        res = await Q.ninvoke(this.client[this.clientType], method, opts);
        if (res && res.message && res.message === 'Moved Permanently') {
          throw new Error("This resource was moved!");
        }
      } catch (nonStdErr) {
        let newErr = new Error(nonStdErr.message);
        throw newErr;
      }
      if (res.meta['x-ratelimit-reset']) {
        let remaining = parseInt(res.meta['x-ratelimit-remaining'], 10);
        if (remaining < 2) {
          let until = moment.unix(parseInt(res.meta['x-ratelimit-reset'], 10));
          let ms = until.diff(moment(Date.now()));
          console.error("      [getting rate-limited, waiting " + ms + "ms]");
          await sleep(ms);
        }
      }
      return res;
    };
    if (!allResults || countOnly) {
      let res = await actualRequest(apiOpts);
      res = this.unwrapRes(res);
      if (!countOnly) {
        return res;
      }
      if (_.isEmpty(res)) {
        return 0;
      }
      if (_.isUndefined(res.total_count)) {
        throw new Error("Asked for count but res didn't have it!");
      }
      return res.total_count;
    } else {
      apiOpts.page = 1;
      apiOpts.per_page = 100;
      let done = false;
      let results = [];
      while (!done) {
        let res;
        try {
          res = await actualRequest(apiOpts);
        } catch (e) {
          if (e.message.indexOf("Only the first") !== -1) {
            console.error("Only got some results from query!!");
            return results;
          } else {
            throw e;
          }
        }
        res = this.unwrapRes(res);
        if (res.length !== 0) {
          results = results.concat(res);
        }
        if (res.length < apiOpts.per_page) {
          done = true;
        }
        apiOpts.page++;
      }
      return results;
    }
  }
}

class GitHubSearch extends GitHubClient {
  constructor (opts) {
    super(opts);
    this.clientType = 'search';
    this.apiResultListWrapper = 'items';
  }

  issues (q, opts, allResults = false) {
    opts.q = q;
    return this.doRequest('issues', opts, allResults);
  }

  numIssues (q, opts) {
    opts.q = q;
    return this.doRequest('issues', opts, false, true);
  }

  async mergedPulls (repoSpec, sinceDate = null) {
    // assume sinceDate is ISO8601 format YYYY-MM-DD
    let q = `repo:${repoSpec} type:pr is:merged`;
    if (sinceDate) {
      q += ` merged:>=${sinceDate}`;
    }
    return await this.doRequest('issues', {q}, true);
  }

}

class GitHubIssue extends GitHubClient {
  constructor (opts, user, repo, number) {
    super(opts);
    this.clientType = 'issues';
    Object.assign(this, {user, repo, number});
  }

  doRequest (method, apiOpts = {}, allResults = false) {
    apiOpts.number = this.number;
    apiOpts.user = this.user;
    apiOpts.repo = this.repo;
    return super.doRequest(method, apiOpts, allResults);
  }

  comments (allResults = false) {
    return this.doRequest('getComments', {}, allResults);
  }
}

class GitHubOrg extends GitHubClient {
  constructor (opts, org) {
    super(opts);
    this.clientType = 'repos';
    this.apiResultListWrapper = null;
    Object.assign(this, {org});
  }

  doRequest (method, apiOpts = {}, allResults = false) {
    apiOpts.org = this.org;
    return super.doRequest(method, apiOpts, allResults);
  }

  async repos () {
    let res = await this.doRequest('getForOrg', {type: 'sources'}, true);
    return res.map(r => r.full_name);
  }
}

class GitHubRepo extends GitHubClient {
  constructor (opts, owner, repo) {
    super(opts);
    this.clientType = 'repos';
    this.apiResultListWrapper = null;
    Object.assign(this, {owner, repo});
  }

  doRequest (method, apiOpts = {}, allResults = false) {
    apiOpts.owner = this.owner;
    apiOpts.repo = this.repo;
    return super.doRequest(method, apiOpts, allResults);
  }

  commits (author = null, opts = {}, allResults = false) {
    let apiOpts = {};
    if (author) {
      apiOpts.author = author;
    }
    Object.assign(apiOpts, opts);
    let res = this.doRequest('getCommits', apiOpts, allResults);
    return res;
  }

  commit (sha) {
    return this.doRequest('getCommit', {sha});
  }

  collaborators (opts, allResults = false) {
    return this.doRequest('getCollaborators', opts, allResults);
  }

  contributors () {
    return this.doRequest('getContributors', {}, true);
  }

  contributorStats () {
    return this.doRequest('getStatsContributors');
  }

  participationStats () {
    return this.doRequest('getStatsParticipation');
  }

  info () {
    return this.doRequest('get');
  }

  releases () {
    return this.doRequest('getReleases');
  }
}
