import ts from 'typescript';

import { readText } from './lib.mjs';

function sourceOf(file, kind = ts.ScriptKind.TS) {
  const text = readText(file);
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

function readonlyOf(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false;
}

function membersOf(node, source) {
  const members = [];
  for (const member of node.members) {
    if (ts.isPropertySignature(member)) {
      members.push({
        name: member.name.getText(source),
        optional: member.questionToken !== undefined,
        readonly: readonlyOf(member),
        type: member.type?.getText(source) ?? 'unknown',
        kind: 'property',
      });
      continue;
    }
    if (ts.isMethodSignature(member)) {
      members.push({
        name: member.name.getText(source),
        optional: member.questionToken !== undefined,
        readonly: false,
        type: member.type?.getText(source) ?? 'void',
        kind: 'method',
      });
    }
  }
  return members;
}

function interfaceNode(source, name) {
  let found;
  source.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) found = node;
  });
  if (found === undefined) throw new Error(`找不到 interface ${name}`);
  return found;
}

function aliasNode(source, name) {
  let found;
  source.forEachChild((node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === name) found = node;
  });
  if (found === undefined) throw new Error(`找不到 type ${name}`);
  return found;
}

function basesOf(node, source) {
  const bases = [];
  for (const clause of node.heritageClauses ?? []) {
    for (const type of clause.types) bases.push(type.expression.getText(source));
  }
  return bases;
}

function flattenedMembers(source, name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const node = interfaceNode(source, name);
  const members = membersOf(node, source);
  const inherited = basesOf(node, source).flatMap((base) => flattenedMembers(source, base, seen));
  return [...members, ...inherited];
}

function refNameOf(node, source) {
  return ts.isTypeReferenceNode(node) ? node.typeName.getText(source) : node.getText(source);
}

function renderProperty(member) {
  const readonly = member.readonly ? 'readonly ' : '';
  const optional = member.optional ? '?' : '';
  return `${readonly}${member.name}${optional}: ${member.type}`;
}

function renderLiteral(members) {
  return `{ ${members.map(renderProperty).join('; ')} }`;
}

export function interfaceFacts(file, name) {
  const source = sourceOf(file);
  return { file, name, members: membersOf(interfaceNode(source, name), source) };
}

export function unionFacts(file, name) {
  const source = sourceOf(file);
  const alias = aliasNode(source, name);
  if (!ts.isUnionTypeNode(alias.type)) throw new Error(`${name} 不是 union`);
  return alias.type.types.map((type) => type.getText(source));
}

export function renderAdapterSet() {
  const facts = interfaceFacts('packages/shared/src/host/adapters.ts', 'AdapterSet');
  const body = facts.members.map((member) => `  ${renderProperty(member)};`).join('\n');
  return ['```ts', `interface ${facts.name} {`, body, '}', '```'].join('\n');
}

export function renderDataContract() {
  const file = 'packages/shared/src/contract/data.ts';
  const source = sourceOf(file);
  const request = aliasNode(source, 'DataRequest');
  const requestVariants = request.type.types.map(
    (type) => `  | ${renderLiteral(flattenedMembers(source, refNameOf(type, source)))}`,
  );
  const result = aliasNode(source, 'DataResult');
  const resultParams = (result.typeParameters ?? []).map((one) => one.getText(source)).join(', ');
  const resultVariants = result.type.types.map(
    (type) => `  | ${renderLiteral(flattenedMembers(source, refNameOf(type, source)))}`,
  );
  const error = interfaceNode(source, 'DataError');
  const errorBody = membersOf(error, source).map((member) => `  ${renderProperty(member)};`);
  const lines = [
    '```ts',
    'type DataRequest =',
    ...requestVariants.map((line, index) => (index === requestVariants.length - 1 ? `${line};` : line)),
    '',
    `type DataResult<${resultParams}> =`,
    ...resultVariants.map((line, index) => (index === resultVariants.length - 1 ? `${line};` : line)),
    '',
    'interface DataError {',
    ...errorBody,
    '}',
    '```',
  ];
  return lines.join('\n');
}

function variableOf(source, name) {
  let found;
  source.forEachChild((node) => {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) found = declaration;
      }
    }
  });
  if (found === undefined) throw new Error(`找不到变量 ${name}`);
  return found;
}

export function arrayLengthOf(file, name) {
  const source = sourceOf(file, ts.ScriptKind.JS);
  const declaration = variableOf(source, name);
  if (declaration.initializer === undefined || !ts.isArrayLiteralExpression(declaration.initializer)) {
    throw new Error(`${name} 不是数组字面量`);
  }
  return declaration.initializer.elements.length;
}

export function arrayValuesOf(file, name) {
  const source = sourceOf(file, ts.ScriptKind.JS);
  const declaration = variableOf(source, name);
  if (declaration.initializer === undefined || !ts.isArrayLiteralExpression(declaration.initializer)) {
    throw new Error(`${name} 不是数组字面量`);
  }
  return declaration.initializer.elements.map((one) => (ts.isStringLiteral(one) ? one.text : one.getText(source)));
}

export function objectKeysOf(file, name) {
  const source = sourceOf(file, ts.ScriptKind.JS);
  const declaration = variableOf(source, name);
  if (declaration.initializer === undefined || !ts.isObjectLiteralExpression(declaration.initializer)) {
    throw new Error(`${name} 不是对象字面量`);
  }
  return declaration.initializer.properties.map((one) => {
    if (ts.isPropertyAssignment(one) && ts.isIdentifier(one.name)) return one.name.text;
    return one.getText(source);
  });
}
