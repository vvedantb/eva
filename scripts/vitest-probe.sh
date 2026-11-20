#!/usr/bin/env bash
# Throwaway probe: time the web Vitest suite under pool and isolation settings.
set -u
cd apps/web
out="$(mktemp -d)"
run() {
  name="$1"; shift
  s=$(date +%s%3N)
  pnpm exec vitest run --reporter=default --reporter=junit --outputFile.junit="$out/$name.xml" "$@" > "$out/$name.log" 2>&1
  rc=$?
  e=$(date +%s%3N)
  sed 's/\x1b\[[0-9;]*m//g' "$out/$name.log" | grep -E "Test Files|^ +Tests |Duration" || true
  if [ "$rc" != "0" ]; then sed 's/\x1b\[[0-9;]*m//g' "$out/$name.log" | grep -E "FAIL|Error" | head -40; fi
  echo "PROBE $name rc=$rc wall_ms=$((e - s))"
}
run default-1
run threads --pool=threads
run forks-noisolate --no-isolate
run threads-noisolate --pool=threads --no-isolate
run default-2
node -e '
const fs=require("fs"),dir=process.argv[1];
const names=f=>{const x=fs.readFileSync(dir+"/"+f+".xml","utf8");return [...x.matchAll(/<testcase classname="([^"]*)" name="([^"]*)"/g)].map(m=>m[1]+" > "+m[2]).sort()};
const base=names("default-1");
for(const v of ["threads","forks-noisolate","threads-noisolate","default-2"]){let n;try{n=names(v)}catch{console.log("PROBE names "+v+" no junit file");continue}
const b=new Set(base),s=new Set(n);const miss=base.filter(x=>!s.has(x)).length,extra=n.filter(x=>!b.has(x)).length;
console.log("PROBE names "+v+" count="+n.length+" base="+base.length+" missing="+miss+" extra="+extra)}
' "$out"
exit 0
