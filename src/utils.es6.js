import Q from 'q';

export function getCommits (client, opts) {
  let done = Q.defer();
  client.repos.getCommits(opts, function (err, res) {
    if (err) return done.reject(err);
    done.resolve(res);
  });
  return done.promise;
}

export function padStr (str, padTo = 20) {
  if (typeof str !== 'string') {
    str = str.toString();
  }
  if (str.length > padTo) {
    console.warn(`Cannot pad, length of '${str}' is ${str.length} which is more than ${padTo}`);
  }
  let out = str;
  for (let i = 0; i < (padTo - str.length); i++) {
    out += ' ';
  }
  return out;
}
