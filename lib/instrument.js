"use strict";

var astgen = require("./astgen.js");
var esprima = require("esprima");
var estraverse = require("estraverse");
var escodegen = require("escodegen");
var jsstana = new (require("jsstana"))();
var _ = require("lodash");

jsstana.addMatcher("var!", function () {
  var that = this;

  var declarationsM = Array.prototype.slice.call(arguments).map(that.matcher, that);

  return function (node) {
    if (node.type !== "VariableDeclaration") { return undefined; }
    if (node.declarations.length !== declarationsM.length) { return undefined; }

    var matches = [];
    for (var i = 0; i < declarationsM.length; i++) {
      var m = declarationsM[i](node.declarations[i]);
      if (m === undefined) { return undefined; }
      matches.push(m);
    }

    return that.combineMatches.apply(that, matches);
  };
});

jsstana.addMatcher("fn-expr", function () {
  return function (node) {
    return node !== null && node.type === "FunctionExpression" ? {} : undefined;
  };
});

var ESPRIMA_OPTIONS = {
  comment: true,
  range: true,
  tokens: true,
};

var ESCODEGEN_OPTIONS = {
  format: {
    indent: {
      style: "  ",
    },
    quotes: "double",
  },
};

function astgentypify(signature, node) {
  return astgen.call(
    astgen.property(
      astgen.identifier("global"),
      astgen.identifier("__typify")
    ),
    [ astgen.literal(signature), node ]
  );
}

// Find comments with ::
function findSignature(node) {
  if (!node.leadingComments) {
    return;
  }

  var m;
  for (var i =0; i < node.leadingComments.length; i++) {
    m = node.leadingComments[i].value.match(/::\s*(.*)/);
    if (m) {
      break;
    }
  }
  if (!m) {
    return;
  }

  return m[1];
}

function instrumentFunctionDeclaration(node) {
  // console.log(node.leadingComments);
  var signature = findSignature(node);
  if (!signature) {
    // console.log(escodegen.generate(node, ESCODEGEN_OPTIONS));
    return;
  }

  signature = node.id.name + " :: " + signature;

  var g = astgen.property(node.id, astgen.identifier("__typify__"));

  var newnode = astgen.fndecl(node.id, [], astgen.block([
    astgen.expr(astgen.assign("=", g, astgen.logical("||", g,
      astgentypify(
        signature,
        astgen.fnexpr(node.params, node.body)
      )
    ))),
    astgen.returnstmt(astgen.call(
      astgen.property(g, astgen.identifier("apply")),
      [ astgen.identifier("this"), astgen.identifier("arguments") ]
    )),
  ]));

  // console.log(escodegen.generate(newnode));
  return newnode;
}

function instrumentFunctionExpressionVar(node, id, fnnode) {
  var signature = findSignature(node);
  if (!signature) {
    return;
  }

  var fnid = (fnnode.id && fnnode.id.name) || id;

  signature = fnid + " :: " + signature;

  var newnode = _.cloneDeep(node);
  newnode.declarations[0].init = astgentypify(signature, fnnode);
  return newnode;
}

function instrumentFunctionExpressionReturn(node, fnnode) {
  var signature = findSignature(node);
  if (!signature) {
    return;
  }

  var fnid = (fnnode.id && fnnode.id.name);
  signature = (fnid ? fnid + " :: " : "") + signature;

  var newnode = _.cloneDeep(node);
  newnode.argument = astgentypify(signature, fnnode);
  return newnode;
}

function trim(str) {
  return str.replace(/^\s*/, "").replace(/\s*$/, "");
}

function instrument(stats, code, file) {
  // console.log("Instrumenting file:", file);

  var syntax = esprima.parse(code, ESPRIMA_OPTIONS);

  // attach comments
  estraverse.attachComments(syntax, syntax.comments, syntax.tokens);

  // Find all blocks
  var blocks = [];
  estraverse.traverse(syntax, {
    enter: function (node) {
      if (node.type === "BlockStatement" || node.type === "Program") {
        blocks.push(node);
      }
    }
  });

  syntax.comments.forEach(function (comment) {
    if (comment.value.match(/^\s*typify:/)) {
      var m, newnode;

      m = comment.value.match(/^\s*typify:\s*type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+=\s*(.*)$/);
      if (m) {
        newnode = astgen.exprstmt(astgen.call(
          astgen.property(
            astgen.property(
              astgen.identifier("global"),
              astgen.identifier("__typify")
            ),
            astgen.identifier("alias")
          ),
          [ astgen.literal(m[1]), astgen.literal(m[2]) ]
        ));
      }

      m = comment.value.match(/^\s*typify:\s*instance\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
      if (m) {
        newnode = astgen.exprstmt(astgen.call(
          astgen.property(
            astgen.property(
              astgen.identifier("global"),
              astgen.identifier("__typify")
            ),
            astgen.identifier("instance")
          ),
          [ astgen.literal(m[1]), astgen.identifier(m[1]) ]
        ));
      }

      m = comment.value.match(/^\s*typify:\s*adt\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\n*((?:\s*(?:[a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*[^\n]+\n)+)\s*/);
      if (m) {
        var name = m[1];
        var parts = _.extend.apply(undefined,
          m[2].split("\n").map(trim).map(function (part) {
            if (part === "") {
              return {};
            }

            var subm = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
            var ret = {};
            ret[subm[1]] = subm[2];
            return ret;
          })
        );

        newnode = astgen.exprstmt(astgen.call(
          astgen.property(
            astgen.property(
              astgen.identifier("global"),
              astgen.identifier("__typify")
            ),
            astgen.identifier("adt")
          ),
          [ astgen.literal(name), astgen.literal(parts) ]
        ));
      }

      if (newnode) {
        // console.info("typify: " + escodegen.generate(newnode, ESCODEGEN_OPTIONS));
        newnode.range = comment.range;

        var block = syntax;
        blocks.forEach(function (possibleBlock) {
          if (possibleBlock.range[0] <= comment.range[0] && possibleBlock.range[1] >= comment.range[1]) {
            if (possibleBlock.range[0] >= block.range[0] && possibleBlock.range[1] <= block.range[1]) {
              block = possibleBlock;
            }
          }
        });

        var i = 0;
        while (i < block.body.length && block.body[i].range[0] < comment.range[0]) {
          i++;
        }

        block.body.splice(i, 0, newnode);
      }
    }
  });

  function count(type, value) {
    stats[type].total += 1;
    if (value) {
      stats[type].count += 1;
    }

    return value;
  }

  // traverse
  estraverse.replace(syntax, {
    enter: function (node) {
      if (node.type === "FunctionDeclaration") {
        return count("functionDeclaration", instrumentFunctionDeclaration(node))  ;
      }

      var m = jsstana.match("(var! (var ?ident (?f fn-expr)))", node);
      if (m) {
        return count("varFunctionExpression", instrumentFunctionExpressionVar(node, m.ident, m.f));
      }

      m = jsstana.match("(return (?f fn-expr))", node);
      if (m) {
        return count("returnFunctionExpression", instrumentFunctionExpressionReturn(node, m.f));
      }
    },
  });

  var result = escodegen.generate(syntax, _.extend({}, ESCODEGEN_OPTIONS, {
    sourceMap: true,
    sourceMapWithCode: true,
  }));

  return result.code;
}

function StatEntry() {
  this.total = 0;
  this.count = 0;
}

function Stats() {
  this.functionDeclaration = new StatEntry();
  this.varFunctionExpression = new StatEntry();
  this.returnFunctionExpression = new StatEntry();
}

instrument.Stats = Stats;

module.exports = instrument;
