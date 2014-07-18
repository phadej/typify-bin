#!/usr/bin/env node

"use strict";

var program = require("commander");
var fs = require("fs");
var which = require("which");
var Module = require("module");
var path = require("path");
var hook = require("istanbul").hook;
var typify = require("typify");
var instrument = require("../lib/instrument.js");
var chalk = require("chalk");

var pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json")).toString());

program.usage("[options] -- command...");
program.usage("[options] file.js");
program.version(pkgJson.version);
program.option("-t, --types <defs>", "Type definitions file");

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
  program.parse(argv);

  if (program.args.length === 0) {
    console.error(chalk.red("Error:") + " command is required");
    console.log(program.outputHelp());
    return 1;
  }

  if (program.types) {
    if (typeof program.types !== "string" ||
      !fs.existsSync(program.types) ||
      !fs.statSync(program.types).isFile()) {
      console.error(chalk.red("Error:") + " types parameter should be a existing file");
      console.log(program.outputHelp());
      return 1;
    }

    // Execute types file to get type definitions
    var typesFile = path.resolve(program.types);
    require(typesFile)(typify);
  }

  var cmd = program.args[0];
  var args = program.args.slice(1);

  if (!fs.existsSync(cmd)) {
      try {
          cmd = which.sync(cmd);
      } catch (ex) {
          console.error(chalk.red("Error:") + "Unable to resolve file " + cmd);
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

cli(process.argv);
