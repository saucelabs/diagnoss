'use strict';

const gulp = require('gulp');
const babel = require('gulp-babel');
const sourcemaps = require('gulp-sourcemaps');
const rename = require('gulp-rename');
const clear = require('clear');
const B = require('bluebird');
const replace = require('gulp-replace');
const path = require('path');
const eslint = require('gulp-eslint');
const debug = require('gulp-debug');
const gulpIf = require('gulp-if');
const log = require('fancy-log');


const VERBOSE = process.env.VERBOSE === '1';

const BABEL_OPTS = {
  configFile: path.resolve(__dirname, '.babelrc'),
};

const SOURCEMAP_OPTS = {
  sourceRoot: function (file) { // eslint-disable-line object-shorthand
    // Point to source root relative to the transpiled file
    return path.relative(path.join(file.cwd, file.path), file.base);
  },
  includeContent: true,
};

const renameEsX = function () {
  return rename(function (path) {
    path.basename = path.basename.replace(/\.es[67]$/, '');
  });
};

const handleError = function (err) {
  for (const line of `${err}`.split('\n')) {
    log.error(line);
  }
  process.exit(1);
};

gulp.task('transpile', function () {
  return gulp.src(['*.js', 'src/**/*.js', 'test/**/*.js', '!gulpfile.js'], {base: './'})
    .pipe(gulpIf(VERBOSE, debug()))
    .pipe(sourcemaps.init())
    .pipe(babel(BABEL_OPTS))
    .on('error', handleError)
    .pipe(replace(/$/, '\n\nrequire(\'source-map-support\').install();\n\n'))
    .pipe(renameEsX())
    .pipe(sourcemaps.write(SOURCEMAP_OPTS))
    .pipe(gulp.dest('dist'));
});

gulp.task('kill-gulp', function () {
  process.exit(0);
});

gulp.task('clear-terminal', function () {
  clear();
  return B.delay(100);
});

// gulp error handling is not very well geared toward watch
// so we have to do that to be safe.
// that should not be needed in gulp 4.0
gulp.task('watch-build', gulp.series(['clear-terminal', 'transpile']));

gulp.task('watch', function () {
  gulp.watch(['src/**/*.js'], ['watch-build']);
  gulp.watch('gulpfile.js', ['clear-terminal', 'kill-gulp']);
});

gulp.task('_spawn-watch', function () {
  const spawnWatch = function () {
    let proc = require('child_process').spawn('./node_modules/.bin/gulp', ['watch'], {stdio: 'inherit'});
    proc.on('close', function () {
      spawnWatch();
    });
  };
  spawnWatch();
});

gulp.task('spawn-watch', gulp.series(['clear-terminal', '_spawn-watch']));

// default target is watch
gulp.task('default', gulp.series(['spawn-watch']));

gulp.task('eslint', function () {
  let opts = {
    fix: process.argv.includes('--fix'),
  };
  return gulp
    .src(['**/*.js', '!node_modules/**', '!dist/**'])
    .pipe(gulpIf(VERBOSE, debug()))
    .pipe(eslint(opts))
    .pipe(eslint.format())
    .pipe(eslint.failAfterError())
    .pipe(gulpIf((file) => file.eslint && file.eslint.fixed, gulp.dest(process.cwd())));
});
