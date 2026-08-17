'use strict';

const os = require('node:os');
const originalUserInfo = os.userInfo;

os.userInfo = (...args) => {
  try {
    return originalUserInfo(...args);
  } catch (error) {
    if (process.platform !== 'win32' || error?.code !== 'ERR_SYSTEM_ERROR') throw error;
    return {
      username: process.env.USERNAME || 'user',
      homedir: process.env.USERPROFILE || process.cwd(),
      shell: process.env.COMSPEC || 'cmd.exe',
      uid: -1,
      gid: -1,
    };
  }
};