import Q from 'q';
import GHApi from 'github';

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
    let actualRequest = (opts) => {
      console.error(`Calling ${this.clientType}.${method} with ` +
                    `${JSON.stringify(apiOpts)}`);
      return Q.ninvoke(this.client[this.clientType], method, opts);
    };
    if (allResults) {
      apiOpts.page = 1;
      apiOpts.per_page = 100;
      let done = false;
      let results = [];
      while (!done) {
        let res = await actualRequest(apiOpts);
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
  }

  issues (q, opts) {
    opts.q = q;
    return this.doRequest('issues', opts);
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

  commits (author, opts, allResults = false) {
    let apiOpts = {author};
    Object.assign(apiOpts, opts);
    return this.doRequest('getCommits', apiOpts, allResults);
  }

  commit (sha) {
    return this.doRequest('getCommit', {sha});
  }

  collaborators (opts, allResults = false) {
    return this.doRequest('getCollaborators', opts, allResults);
  }
}
