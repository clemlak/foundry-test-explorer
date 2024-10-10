// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'node:child_process';
const execPromise = promisify(exec);

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const testController = vscode.tests.createTestController('foundrytestexplorer', 'Foundry Test Explorer');
  context.subscriptions.push(testController);

  // Discover tests when a workspace is opened or files are changed
  vscode.workspace.onDidChangeWorkspaceFolders(() => discoverTests(testController));
  vscode.workspace.onDidCreateFiles(() => discoverTests(testController));
  vscode.workspace.onDidDeleteFiles(() => discoverTests(testController));
  vscode.workspace.onDidSaveTextDocument(() => discoverTests(testController));

  testController.createRunProfile(
    'Run tests',
    vscode.TestRunProfileKind.Run,
    async (request, token) => runHandler(testController, request, token),
    true
  );

  discoverTests(testController);

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "foundrytestexplorer" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand('foundrytestexplorer.helloWorld', () => {
    // The code you place here will be executed every time your command is executed
    // Display a message box to the user
    vscode.window.showInformationMessage('Hello World from ta mere!');
  });

  context.subscriptions.push(disposable);

  vscode.commands.executeCommand("foundrytestexplorer.helloWorld");
}

// This method is called when your extension is deactivated
export function deactivate() { }

function discoverTests(controller: vscode.TestController) {
  controller.items.forEach(item => controller.items.delete(item.id));

  const testFiles = vscode.workspace.findFiles('test/**/*.t.sol');

  testFiles.then(files => {
    files.forEach(fileUri => {
      const fileName = path.basename(fileUri.fsPath);
      const testFile = controller.createTestItem(fileUri.fsPath, fileName, fileUri);
      controller.items.add(testFile);

      vscode.workspace.openTextDocument(fileUri).then(doc => {
        const testFunctions = findTestFunctions(doc);

        testFunctions.forEach(testFunction => {
          const testItem = controller.createTestItem(testFunction.name, testFunction.name, fileUri);
          testItem.range = testFunction.range;
          testFile.children.add(testItem);
        });
      });
    });
  })
}

function findTestFunctions(document: vscode.TextDocument): { name: string, range: vscode.Range }[] {
  const testFunctions: { name: string, range: vscode.Range }[] = [];
  const regex = /\bfunction\s+(test_\w+)\s*\(/g;
  const text = document.getText();
  let match;

  while ((match = regex.exec(text)) !== null) {
    const startPosition = document.positionAt(match.index);
    const range = new vscode.Range(startPosition, startPosition);
    testFunctions.push({ name: match[1], range });
  }

  return testFunctions;
}

async function runHandler(controller: vscode.TestController, request: vscode.TestRunRequest, token: vscode.CancellationToken) {
  const run = controller.createTestRun(request);

  if (request.include) {
    for (const test of request.include) {
      await runTestItem(test, run);

      if (token.isCancellationRequested) break;
    }
  }

  run.end();
}

async function runTestItem(test: vscode.TestItem, run: vscode.TestRun) {
  const testFilePath = test.uri?.fsPath;
  const testFunctionName = test.id;

  run.started(test);

  if (testFilePath && testFunctionName) {
    try {
      const { stdout, stderr } = await execPromise(`forge test --match-test ${testFunctionName}`, { cwd: vscode.workspace.rootPath });

      if (stderr) {
        console.log("Test failed");
        run.failed(test, new vscode.TestMessage(`${stderr}`));
      } else {
        run.passed(test);
      }
    } catch (e: any) {
      run.failed(test, new vscode.TestMessage(e.stdout.split('[')[1].split(']')[0]));
    }
  } else {
    run.failed(test, new vscode.TestMessage("Test not found"));
  }
}