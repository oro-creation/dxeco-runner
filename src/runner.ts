import { Spinner } from 'cli-spinner';
import kleur from 'kleur';
import { machineId } from 'node-machine-id';
import readline from 'readline';

import { sleep } from './utils/sleep';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export const runner = async () => {
  const id = await machineId();

  console.log(kleur.blue('Starting dxeco-runner...'));
  const spinner = new Spinner(`Registering dxeco-runner with ID: ${id}`);
  spinner.start();

  // TODO: ランナー登録APIを呼び出す
  await sleep(5000);

  spinner.stop();
  console.log(kleur.blue('Registration complete.'));
  console.log(kleur.blue('Preparation complete.'));
  console.log(kleur.green('Ready'));

  // TODO: ランナーのジョブAPIをポーリングする
  // TODO: ジョブがあればジョブ内容に従って実行する
  // TODO: 終わり、またポーリング

  promptForQuit();
};

const promptForQuit = () => {
  rl.question('Press q to quit: ', (answer) => {
    if (answer.toLowerCase() === 'q') {
      console.log('Quitting...');
      rl.close();
      process.exit(0);
    } else {
      console.log('Invalid input. Press q to quit.');
      promptForQuit();
    }
  });
};
