const fs = require('node:fs');
const path = require('node:path');

const sourceRoot = path.join(__dirname, '..', 'src');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(target);
  }
}

walk(sourceRoot);

const checks = [
  { name: '하드코딩된 비밀값', expression: /(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"][^'"]{8,}/i },
  { name: '비밀번호·암호문 로그', expression: /console\.(?:log|info|warn|error)\([^\n]*(?:password|passphrase|secret)/i },
  { name: '민감 데이터 localStorage 저장', expression: /localStorage\.setItem\([^\n]*(?:password|passphrase|card|account)/i },
];

const findings = files.flatMap((file) => {
  const content = fs.readFileSync(file, 'utf8');
  return checks.flatMap((check) => content.split(/\r?\n/).flatMap((line, index) => check.expression.test(line)
    ? [`${path.relative(path.join(__dirname, '..'), file)}:${index + 1} ${check.name}`]
    : []));
});

if (findings.length) {
  process.stderr.write(`보안 검사 실패\n${findings.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`보안 검사 통과: 앱 소스 ${files.length}개 파일\n`);
