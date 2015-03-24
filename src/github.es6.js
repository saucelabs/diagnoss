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
      console.error(`Calling ${method} with ${JSON.stringify(apiOpts)}`);
      return Q.ninvoke(this.client[this.clientType], method, opts);
    };
    if (allResults) {
      apiOpts.page = 1;
      apiOpts.per_page = 100;
      let done = false;
      let results = [];
      while (!done) {
        let res = await actualRequest(apiOpts);
        if (res.length === 0) {
          done = true;
        } else {
          results = results.concat(res);
          apiOpts.page++;
        }
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
