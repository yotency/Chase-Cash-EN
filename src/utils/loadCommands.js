import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadCommandModules() {
  const commandsRoot = path.resolve(process.cwd(), 'src/commands');
  const modules = [];

  for (const folder of fs.readdirSync(commandsRoot)) {
    const folderPath = path.join(commandsRoot, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    for (const file of fs.readdirSync(folderPath)) {
      if (!file.endsWith('.js')) continue;
      const fileUrl = pathToFileURL(path.join(folderPath, file)).href;
      const command = await import(fileUrl);
      if (command.data && command.execute) {
        modules.push(command);
      }
    }
  }

  return modules;
}
