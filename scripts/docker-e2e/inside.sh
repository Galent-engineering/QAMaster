#!/bin/sh
# Runs in the container as the user `node`, started by run.sh. Each step states the exit code QAMaster 0.3.1 gives
# (findings F1–F11 of the 0.3.0 report, fixed in 0.3.1; docs/plans/0.3.1.md).
set -u
Q="node /opt/qamaster/plugin/src/cli/main.mts"   # the plugin ships no bin/ (Q45)
E2E=/opt/e2e
NOUV=/usr/local/bin:/usr/bin:/bin   # everything but uv
NOGIT=$HOME/nogit-bin               # node, npm and the shell tools, but no git, python3 or uv
mkdir -p "$NOGIT" && for t in node npm npx sh dirname grep; do ln -sf "$(command -v $t)" "$NOGIT/$t"; done
mismatches=0
step() { printf '\n## %s\n' "$*"; }
# expect <code> <command…>: runs the command and counts a different exit code as a mismatch
expect() {
  want=$1
  shift
  "$@"
  got=$?
  if [ "$got" = "$want" ]; then echo "-> exit $got, as expected"; else echo "-> exit $got, EXPECTED $want"; mismatches=$((mismatches + 1)); fi
}
newest_plan() { ls -t .qamaster/plans | head -1 | sed 's/\.json$//'; }
ID='-c user.email=dev@example.test -c user.name=Dev'
# git_repo <source> <dest>: a clone of the source when it is a git repo (a full one, with its history). A plain folder, as
# the fixtures are, first becomes a repo with one commit, then is cloned the same way, so `origin` exists in both cases.
git_repo() {
  if [ ! -e "$1/.git" ]; then
    mkdir -p "$2.seed" && cp -r "$1"/. "$2.seed"/ && git -C "$2.seed" init -q -b main
    git -C "$2.seed" $ID add -A && git -C "$2.seed" $ID commit -qm 'Initial commit'
    set -- "$2.seed" "$2"
  fi
  git clone -q "$1" "$2"
}

# ---------- pytest path: a clone of CheckMasterDemo, tests in the app repo ----------
step 'Without git: setup and plan both name it (F1)'
mkdir ~/nogit && cp -r /src/CheckMasterDemo/site /src/CheckMasterDemo/tests /src/CheckMasterDemo/pyproject.toml ~/nogit/
cd ~/nogit
expect 2 env PATH=$NOGIT $Q setup --no-install --app CheckMasterDemo
expect 2 env PATH=$NOGIT QAMASTER_STORE=file $Q plan

step 'Setup in the demo clone, with the claude-code entry point'
git_repo /src/CheckMasterDemo ~/demo && cd ~/demo
# a lock can't be made offline, so the fixture has none: made here, from the image's python3 (no Python is downloaded)
if [ ! -e uv.lock ]; then
  UV_PYTHON_DOWNLOADS=never uv lock -q && git $ID add uv.lock && git $ID commit -qm 'uv.lock' ||
    { echo '-> uv lock failed (it needs PyPI and a Python of 3.11 or later)'; mismatches=$((mismatches + 1)); }
fi
expect 0 $Q setup --no-install --app CheckMasterDemo --entry claude-code
export QAMASTER_STORE=file
node $E2E/seed-checkmaster.mts
git $ID add -A && git $ID commit -qm 'QAMaster setup and file store'
git init -q --bare ~/remotes/demo.git && git remote set-url origin ~/remotes/demo.git
git branch -m main && git push -q -u origin main && git remote set-head origin main
git switch -q -c feature/coupon && echo '// SAVE10 is the launch coupon.' >>site/coupon.js && git $ID commit -qam 'coupon: note'

step 'doctor: app is a WARN on a gate-only project; the pytest runner is checked (F4)'
expect 2 $Q doctor

step 'plan without uv: blocked, says how to install uv (F3)'
expect 2 env PATH=$NOUV $Q plan

step 'plan with python3 but no pytest (no uv.lock)'
cp -r ~/demo ~/demo-nolock && cd ~/demo-nolock && git rm -q uv.lock && git $ID commit -qm 'no lock'
expect 2 $Q plan
cd ~/demo

step 'plan with uv but no environment: blocked with uv sync, nothing downloaded (F5)'
expect 2 $Q plan
expect 0 test ! -e ~/.local/share/uv/python
uv sync -q # the person's step: downloads the test dependencies (the image's Python 3.11 is enough: no Python download)
expect 3 $Q plan
P=$(newest_plan)

step 'approve with no terminal and no --yes: blocked'
expect 2 $Q approve "$P"

step 'approve without a git identity'
expect 2 $Q approve "$P" --yes
git config --global user.email dev@example.test && git config --global user.name Dev
expect 0 $Q approve "$P" --yes

step 'run without a browser: blocked with the install command (F2)'
expect 2 $Q run "$P"

step 'Chromium for Python, then check'
uv run playwright install chromium >/dev/null 2>&1
expect 0 $Q check --yes
expect 0 sh $E2E/hook-event.sh "$PWD"
git push -q origin feature/coupon && echo 'pushed after the pass'

step 'Break the discount: FAIL, and the hook blocks'
sed -i 's/discount: 0.1 }/discount: 0.2 }/' site/coupon.js && git commit -qam 'coupon: 20%'
expect 1 $Q check --yes
expect 0 sh -c "sh $E2E/hook-event.sh $PWD | grep -q 'hook exit=2'"

step 'An unchecked commit: the hook blocks'
git reset -q --hard HEAD~1 && echo x >>README.md && git commit -qam readme
expect 0 sh -c "sh $E2E/hook-event.sh $PWD | grep -q 'hook exit=2'"

step 'git off PATH in a gated repo: the hook allows, with a note (F11)'
expect 0 env PATH=$NOGIT sh -c "sh $E2E/hook-event.sh $PWD 2>&1 | grep -q \"couldn't check this push\""
unset QAMASTER_STORE

# ---------- playwright-bdd path: Juice Shop, a separate QA project ----------
step 'Wait for Juice Shop on the shared network'
expect 0 node -e "(async()=>{for(let i=0;i<60;i++){try{if((await fetch('http://juice-shop:3000')).ok)return}catch{}await new Promise(r=>setTimeout(r,2000))}process.exit(1)})()"

step 'QA project from /src/qa (config, DSM, a reviewed TestGen run; .claude, package.json and .gitignore if it has them)'
git_repo /src/juice-shop ~/juice-shop
mkdir ~/qa && cd ~/qa && git init -q -b main
cp -r /src/qa/config /src/qa/dsm .
for f in .claude package.json .gitignore; do if [ -e /src/qa/$f ]; then cp -r /src/qa/$f .; fi; done
mkdir -p testgen/output && cp -r /src/qa/testgen/output/. testgen/output/
export QAMASTER_STORE=file
R=testgen/output/$(ls testgen/output | head -1)
expect 2 $Q doctor
expect 0 $Q setup --no-install --url http://juice-shop:3000 --source ~/juice-shop --name juiceshop-online
expect 0 $Q publish $R --apply
expect 0 $Q app create --app JuiceShopOnline --web-url http://juice-shop:3000
git add -A && git commit -qm 'QA project' && git init -q --bare ~/remotes/qa.git
git remote add origin ~/remotes/qa.git && git push -q -u origin main
unset QAMASTER_STORE

step 'Change the About page, plan, automate'
cd ~/juice-shop
printf 'QAMASTER_STORE=file\nQAMASTER_TEST_ROOT=../qa\n' >.env
git switch -q -c feature/about && sed -i '1i // About page: tidy' frontend/src/app/about/about.component.ts
git commit -qam 'about: tidy'
expect 3 $Q plan
P=$(newest_plan)
expect 3 $Q automate "$P"

step 'Draft two scripts; check-scripts before npm install is blocked (F8)'
cp -r $E2E/drafts/. ~/qa/JuiceShopOnline/
expect 2 $Q check-scripts
(cd ~/qa/JuiceShopOnline && npm install --no-audit --no-fund --loglevel=error >/dev/null)
expect 0 $Q check-scripts
expect 3 $Q automate "$P" --done
expect 0 $Q approve "$P" --yes
expect 0 $Q run "$P"

step 'Publish before the scripts are pushed: nothing written'
cd ~/qa
expect 0 sh -c "QAMASTER_STORE=file $Q publish $R | grep 'Scripts not pushed'"
git add -A && git commit -qm 'Scripts' && git push -q
expect 0 env QAMASTER_STORE=file $Q publish $R --apply
grep -o 'bdd:@TC-[A-Z0-9-]*' testcases/testcases.csv | sort -u
git commit -qam 'Publish script links' && git push -q

step 'The next check runs the store-linked scripts; the app repo shows no gate files (F7)'
cd ~/juice-shop
expect 0 $Q check --yes
expect 1 sh -c "git status --porcelain --untracked-files=all | grep -E '\\.qamaster/(plans|verdicts|evidence)|\\.env'"

step 'doctor no longer blocks the next plan (F6)'
expect 2 $Q doctor # FIX Playwright: setup ran with --no-install, so the crawl's package isn't there
expect 3 $Q plan

step 'App unreachable: blocked, names the URL (F2)'
expect 3 $Q plan
P=$(newest_plan)
expect 0 $Q approve "$P" --yes
expect 2 env WEB_BASE_URL=http://localhost:3000 $Q run "$P"

step 'Gate the app repo with the push hook'
expect 0 $Q integrations add claude-code
# the unreachable-app run was blocked and wrote no verdict (Q41), so this commit's earlier pass still stands
expect 0 sh -c "sh $E2E/hook-event.sh $PWD | grep -q 'hook exit=0'"

printf '\n%s step(s) gave an unexpected exit code.\n' "$mismatches"
exit "$mismatches"
