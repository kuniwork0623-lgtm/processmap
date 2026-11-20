#!/usr/bin/env bash
# ProcessMap を Vercel の既存プロジェクト「processmap」へデプロイする。
#   scripts/deploy.sh            -> プレビュー（本番には影響しない）
#   scripts/deploy.sh --prod     -> 本番（processmap-green.vercel.app が切り替わる）※本人の承認後のみ
#
# 認証: Claude Code クラウド環境では api.vercel.com 宛ての通信にプロキシがトークンを自動付与する。
#       ローカルで使う場合は VERCEL_TOKEN を環境変数に入れる（値は絶対にコミットしない）。
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_ID="prj_mgGN1KTY8uDhNAUm2P3MhVxHEovM"
TEAM_ID="team_i4UjPFgpGkZ0WxHNVMwTLAam"
TOKEN="${VERCEL_TOKEN:-proxy-injected}"
API="https://api.vercel.com"
FILES=(index.html config.js sync.js vercel.json favicon.svg apple-touch-icon.png)
TARGET="preview"; [[ "${1:-}" == "--prod" ]] && TARGET="production"

# 1) 紐付け先の照合（別プロジェクトや常夜へ誤デプロイしない）
name=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$API/v9/projects/$PROJECT_ID?teamId=$TEAM_ID" | python3 -c 'import json,sys;print(json.load(sys.stdin)["name"])')
[[ "$name" == "processmap" ]] || { echo "プロジェクト名が processmap ではありません: $name" >&2; exit 1; }

# 2) 未コミットの変更があるならデプロイしない（デプロイ内容とGitを一致させる）
if [[ -n "$(git status --porcelain -- "${FILES[@]}")" ]]; then echo "未コミットの変更があります。先にコミットしてください。" >&2; exit 1; fi

# 3) デプロイ
body=$(mktemp); res=$(mktemp); trap 'rm -f "$body" "$res"' EXIT
python3 - "$TARGET" "${FILES[@]}" > "$body" <<'PY'
import json,base64,subprocess,sys
target,files=sys.argv[1],sys.argv[2:]
sha=subprocess.check_output(['git','rev-parse','--short','HEAD']).decode().strip()
branch=subprocess.check_output(['git','rev-parse','--abbrev-ref','HEAD']).decode().strip()
d={'name':'processmap','project':'prj_mgGN1KTY8uDhNAUm2P3MhVxHEovM','projectSettings':{'framework':None},
   'files':[{'file':f,'data':base64.b64encode(open(f,'rb').read()).decode(),'encoding':'base64'} for f in files],
   'meta':{'gitCommit':sha,'branch':branch}}
if target=='production': d['target']='production'
print(json.dumps(d))
PY
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  "$API/v13/deployments?teamId=$TEAM_ID&skipAutoDetectionConfirmation=1" --data-binary @"$body" -o "$res"
id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["id"])' "$res")
url=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["url"])' "$res")
echo "deployment: $id  https://$url  (target=$TARGET)"

# 4) READY まで待つ
for _ in $(seq 1 45); do
  st=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$API/v13/deployments/$id?teamId=$TEAM_ID" | python3 -c 'import json,sys;print(json.load(sys.stdin)["readyState"])')
  [[ "$st" == READY ]] && break; [[ "$st" == ERROR || "$st" == CANCELED ]] && { echo "失敗: $st" >&2; exit 1; }
  sleep 4
done
[[ "$st" == READY ]] || { echo "タイムアウト: $st" >&2; exit 1; }

# 5) Vercel上のファイルが手元(テスト済み)と一致するかSHA1で照合
curl -fsS -H "Authorization: Bearer $TOKEN" "$API/v6/deployments/$id/files?teamId=$TEAM_ID" | python3 -c '
import json,sys,hashlib
d=json.load(sys.stdin);out={}
def walk(n):
  for x in n:
    if x["type"]=="directory": walk(x.get("children",[]))
    else: out[x["name"]]=x.get("uid")
walk(d if isinstance(d,list) else [d]);bad=0
for f in sys.argv[1:]:
  ok=out.get(f)==hashlib.sha1(open(f,"rb").read()).hexdigest();bad+=not ok;print(("OK  " if ok else "NG  ")+f)
sys.exit(1 if bad else 0)' "${FILES[@]}"
echo "READY: https://$url"
[[ "$TARGET" == production ]] && echo "本番URL https://processmap-green.vercel.app を再確認してください。"
exit 0
