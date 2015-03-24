import Q from 'q';

export function getCommits (client, opts) {
  let done = Q.defer();
  client.repos.getCommits(opts, function (err, res) {
    if (err) return done.reject(err);
    done.resolve(res);
  });
  return done.promise;
}
