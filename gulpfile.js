"use strict";

var gulp = require("gulp");
var babel = require("gulp-babel");
var sourcemaps = require("gulp-sourcemaps");
var rename = require("gulp-rename");
var clear = require('clear');
const B = require('bluebird');
const replace = require('gulp-replace');
const path = require('path');


var exitOnError = false;

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

gulp.task('transpile', function () {
  var mapPath = null;
  return gulp.src("src/**/*.js")
    // .pipe(rename(function (path) {
    //   path.basename = path.basename.replace(".es6", "");
    //   mapPath = path.basename + ".map";
    // }))
    .pipe(sourcemaps.init())
    .pipe(babel(BABEL_OPTS))
    .pipe(replace(/$/, '\n\nrequire(\'source-map-support\').install();\n\n'))
    .pipe(renameEsX())
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest("dist"));
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
  exitOnError = true;
  gulp.watch(['src/**/*.js'], ['watch-build']);
  gulp.watch('gulpfile.js', ['clear-terminal', 'kill-gulp']);
});

gulp.task('_spawn-watch', function () {
 var spawnWatch = function() {
    var proc = require('child_process').spawn('./node_modules/.bin/gulp', ['watch'], {stdio: 'inherit'});
    proc.on('close', function () {
      spawnWatch();
    });
  };
  spawnWatch();
});

gulp.task('spawn-watch', gulp.series(['clear-terminal', '_spawn-watch']));

// default target is watch
gulp.task('default', gulp.series(['spawn-watch']));
