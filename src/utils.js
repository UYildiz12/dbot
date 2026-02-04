'use strict';

const { spawn } = require('node:child_process');

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      const message = stderr.trim() || `Command failed with exit code ${code}`;
      reject(new Error(message));
    });
  });
}

module.exports = {
  runCommand,
};
