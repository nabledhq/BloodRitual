// Temporary local edit helper (not committed). Applies exact string replacements from tmp_edit.json.
import fs from 'node:fs';
const edits = JSON.parse(fs.readFileSync('tmp_edit.json', 'utf8'));
let failed = false;
for (const { file, find, replace } of edits) {
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const count = src.split(find).length - 1;
  if (count !== 1) {
    console.error(`${file}: expected 1 match, found ${count} for: ${find.slice(0, 60)}`);
    failed = true;
    continue;
  }
  fs.writeFileSync(file, src.replace(find, () => replace));
  console.log(`${file}: ok`);
}
process.exit(failed ? 1 : 0);
