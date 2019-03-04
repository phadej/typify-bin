"use strict";

var _ = require("lodash");

function property(object, prop) {
  return {
    type: "MemberExpression",
    object: object,
    property: prop,
    computed: false,
  };
}

function identifier(name) {
  return {
    type: "Identifier",
    name: name,
  };
}

function literal(value) {
  if (_.isObject(value)) {
    return {
      type: "ObjectExpression",
      properties: _.map(value, function (v, k) {
        return {
          type: "Property",
          kind: "init",
          key: literal(k),
          value: literal(v),
        };
      }),
    };
  } else {
    return {
      type: "Literal",
      value: value,
    };
  }
}

module.exports = {
  exprstmt: function (expr) {
    return {
      type: "ExpressionStatement",
      expression: expr,
    };
  },
  call: function (callee, args) {
    return {
      type: "CallExpression",
      callee: callee,
      arguments: args,
    };
  },
  literal: literal,
  property: property,
  lookup: function (name) {
    var parts = name.split(".").map(identifier);
    return parts.reduce(property);
  },
  fnexpr: function (params, body) {
    return {
      type: "FunctionExpression",
      body: body,
      defaults: [],
      params: params,
      expression: false,
      generator: false,
      id: null,
    };
  },
  fndecl: function (id, params, body) {
    return {
      type: "FunctionDeclaration",
      body: body,
      defaults: [],
      params: params,
      expression: false,
      generator: false,
      id: id,
    };
  },
  expr: function (expression) {
    return {
      type: "ExpressionStatement",
      expression: expression,
    };
  },
  identifier: identifier,
  block: function (body) {
    return {
      type: "BlockStatement",
      body: body,
    };
  },
  returnstmt: function (argument) {
    return {
      type: "ReturnStatement",
      argument: argument,
    };
  },
  assign: function (operator, left, right) {
    return {
      type: "AssignmentExpression",
      operator: operator,
      left: left,
      right: right,
    };
  },
  logical: function (operator, left, right) {
    return {
      type: "LogicalExpression",
      operator: operator,
      left: left,
      right: right,
    };
  },
};
