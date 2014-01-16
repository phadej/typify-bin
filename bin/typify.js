#!/usr/bin/env node

"use strict";

var optimist = require("optimist");
var fs = require("fs");
var which = require("which");
var Module = require("module");
var path = require("path");
var hook = require("istanbul").hook;
var typify = require("typify");
var instrument = require("../lib/instrument.js");

require("colors");

optimist.usage("typify [options] -- command...");

optimist.boolean("h").options("h", {
  alias: "help",
  describe: "Show brief help information",
});

optimist.boolean("v").options("v", {
  alias: "version",
  describe: "Display version information and exit.",
});

optimist.options("t", {
  alias: "types",
  string: true,
  describe: "Type definitions",
});

function hookMatcher(file) {
  file = path.resolve(file);
  if (file.match(/\/node_modules\//)) {
    return false;
  }
  if (file.match(/\/tests?\//)) {
    return false;
  }
  return true;
}

function cli(argv) {
  var options = optimist.parse(argv);

  if (options.help) {
    console.log(optimist.help());
    return 0;
  }

  if (options.version) {
    var pkg = JSON.parse(fs.readFileSync(__dirname + "/../package.json"));
    console.log("jsgrep, part of jsstana version " + pkg.version);
    return 0;
  }

  if (options._.length === 0) {
    console.error("Error:".red + " command is required");
    console.log(optimist.help());
    return 1;
  }

  if (options.types) {
    if (typeof options.types !== "string" ||
      !fs.existsSync(options.types) ||
      !fs.statSync(options.types).isFile()) {
      console.error("Error:".red + " types parameter should be a existing file");
      console.log(optimist.help());
      return 1;
    }

    // Execute types file to get type definitions
    var typesFile = path.resolve(options.types);
    require(typesFile)(typify);
  }

  var cmd = options._[0];
  var args = options._.slice(1);

  if (!fs.existsSync(cmd)) {
      try {
          cmd = which.sync(cmd);
      } catch (ex) {
          console.error("Error:".red + "Unable to resolve file " + cmd);
          return 1;
      }
  } else {
      cmd = path.resolve(cmd);
  }

  var stats = new instrument.Stats();

  // Add hook
  hook.hookRequire(hookMatcher, instrument.bind(undefined, stats));

  global.__typify = typify;

  // Run
  process.argv = ["node", cmd].concat(args);
  process.env.running_under_typify = true;

  // Print stats at exit
  process.once("exit", function () {
    console.log("Function declarations: ", stats.functionDeclaration.count, "/", stats.functionDeclaration.total);
    console.log("Var function expression:", stats.varFunctionExpression.count, "/", stats.varFunctionExpression.total);
    console.log("Return function expression:", stats.returnFunctionExpression.count, "/", stats.returnFunctionExpression.total);
  });

  Module.runMain(cmd, null, true);
}

cli(process.argv.slice(2));
