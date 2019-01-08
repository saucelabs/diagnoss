import log from 'fancy-log';


export function padStr (str, padTo = 20) {
  if (typeof str !== 'string') {
    str = str.toString();
  }
  if (str.length > padTo) {
    log.warn(`Cannot pad, length of '${str}' is ${str.length} which is more than ${padTo}`);
  }
  let out = str;
  for (let i = 0; i < (padTo - str.length); i++) {
    out += ' ';
  }
  return out;
}
