import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export default function promptForQuit() {
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
}
