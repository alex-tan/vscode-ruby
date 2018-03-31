"use strict";

import * as vscode from 'vscode';
import { Location, ExtensionContext, Position } from 'vscode';
import * as Locate from './locate/locate';
import * as path from 'path';
import { LintCollection } from './lint/lintCollection';
import * as utils from './utils';
import { registerTaskProvider } from './task/rake';
import { Config as LintConfig } from './lint/lintConfig';
import * as debounce from 'lodash/debounce';

import { registerCompletionProvider } from './providers/completion';
import { registerFormatter } from './providers/formatter';
import { registerHighlightProvider } from './providers/highlight';
import { registerIntellisenseProvider } from './providers/intellisense';

export function activate(context: ExtensionContext) {
	const subs = context.subscriptions;
	// register language config
	vscode.languages.setLanguageConfiguration('ruby', {
		indentationRules: {
			increaseIndentPattern: /^(\s*(module|class|((private|protected)\s+)?def|unless|if|else|elsif|case|when|begin|rescue|ensure|for|while|until|(?=.*?\b(do|begin|case|if|unless)\b)("(\\.|[^\\"])*"|'(\\.|[^\\'])*'|[^#"'])*(\s(do|begin|case)|[-+=&|*/~%^<>~]\s*(if|unless)))\b(?![^;]*;.*?\bend\b)|("(\\.|[^\\"])*"|'(\\.|[^\\'])*'|[^#"'])*(\((?![^\)]*\))|\{(?![^\}]*\})|\[(?![^\]]*\]))).*$/,
			decreaseIndentPattern: /^\s*([}\]]([,)]?\s*(#|$)|\.[a-zA-Z_]\w*\b)|(end|rescue|ensure|else|elsif|when)\b)/
		},
		wordPattern: /(-?\d+(?:\.\d+))|(:?[A-Za-z][^-`~@#%^&()=+[{}|;:'",<>/.*\]\s\\!?]*[!?]?)/
	});

	registerHighlightProvider(context);
	registerLinters(context);
	registerCompletionProvider(context);
	registerFormatter(context);
	registerIntellisenseProvider(context);
	registerTaskProvider(context);
	utils.loadEnv();
}

function getGlobalLintConfig() : LintConfig {
	let globalConfig = new LintConfig();

	let pathToRuby = vscode.workspace.getConfiguration("ruby.interpreter").commandPath;
	if (pathToRuby) {
		globalConfig.pathToRuby = pathToRuby;
	}

	let useBundler = vscode.workspace.getConfiguration("ruby").get<boolean | null>("useBundler");
	if (useBundler !== null) {
		globalConfig.useBundler = useBundler;
	}

	let pathToBundler = vscode.workspace.getConfiguration("ruby").pathToBundler;
	if (pathToBundler) {
		globalConfig.pathToBundler = pathToBundler;
	}
	return globalConfig;
}

function registerLinters(ctx: ExtensionContext) {
	const globalConfig = getGlobalLintConfig();
	const linters = new LintCollection(globalConfig, vscode.workspace.getConfiguration("ruby").lint, vscode.workspace.rootPath);
	ctx.subscriptions.push(linters);

	function executeLinting(e: vscode.TextEditor | vscode.TextDocumentChangeEvent) {
		if (!e) return;
		linters.run(e.document);
	}

	// Debounce linting to prevent running on every keypress, only run when typing has stopped
	const lintDebounceTime = vscode.workspace.getConfiguration('ruby').lintDebounceTime;
	const executeDebouncedLinting = debounce(executeLinting, lintDebounceTime);

	ctx.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(executeLinting));
	ctx.subscriptions.push(vscode.workspace.onDidChangeTextDocument(executeDebouncedLinting));
	ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		const docs = vscode.window.visibleTextEditors.map(editor => editor.document);
		console.log("Config changed. Should lint:", docs.length);
		const globalConfig = getGlobalLintConfig();
		linters.cfg(vscode.workspace.getConfiguration("ruby").lint, globalConfig);
		docs.forEach(doc => linters.run(doc));
	}));

	// run against all of the current open files
	vscode.window.visibleTextEditors.forEach(executeLinting);
}
