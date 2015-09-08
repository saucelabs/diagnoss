import Q from 'q';
import GHApi from 'github';
import moment from 'moment';
import { sleep } from 'asyncbox';

export class GitHub {
  constructor (opts) {
    this.opts = opts;
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

  async doRequest (method, apiOpts = {}, allResults = false) {
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
    if (allResults) {
      apiOpts.page = 1;
      apiOpts.per_page = 100;
      let done = false;
      let results = [];
      while (!done) {
        let res = await actualRequest(apiOpts);
        if (this.apiResultListWrapper) {
          res = res[this.apiResultListWrapper];
        }
        if (res.length !== 0) {
          results = results.concat(res);
        }
        if (res.length < apiOpts.per_page) {
          done = true;
        }
        apiOpts.page++;
      }
      return results;
    } else {
      return actualRequest(apiOpts);
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

class GitHubRepo extends GitHubClient {
  constructor (opts, user, repo) {
    super(opts);
    this.clientType = 'repos';
    Object.assign(this, {user, repo});
  }

  doRequest (method, apiOpts = {}, allResults = false) {
    apiOpts.user = this.user;
    apiOpts.repo = this.repo;
    return super.doRequest(method, apiOpts, allResults);
  }

  commits (author = null, opts = {}, allResults = false) {
    let apiOpts = {};
    if (author) {
      apiOpts.author = author;
    }
    Object.assign(apiOpts, opts);
    return this.doRequest('getCommits', apiOpts, allResults);
  }

  commit (sha) {
    return this.doRequest('getCommit', {sha});
  }

  collaborators (opts, allResults = false) {
    return this.doRequest('getCollaborators', opts, allResults);
  }

  contributors () {
    return this.doRequest('getContributors');
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
}
