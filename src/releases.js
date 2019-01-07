import { GitHub } from './github';
import moment from 'moment';

const client = new GitHub({
  username: process.env.GITHUB_USER,
  password: process.env.GITHUB_ACCESS_TOKEN
});

export async function numDownloads (repoList = [], opts = {since: null, until: null}) {
  let count = 0;
  if (!opts.since) {
    opts.since = '1982-09-26';
  }
  if (!opts.until) {
    opts.until = '2182-09-26';
  }
  let since = moment(opts.since), until = moment(opts.until);
  for (let repoSpec of repoList) {
    let repo = client.repo(...repoSpec.split('/'));
    let releases = await repo.releases();
    for (let release of releases) {
      let publishedAt = moment(release.published_at);
      if (publishedAt.isSameOrAfter(since, 'day') &&
          publishedAt.isSameOrBefore(until, 'day')) {
        for (let asset of release.assets) {
          count += asset.download_count;
        }
      }
    }
  }
  return count;
}
